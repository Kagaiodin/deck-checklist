# Design Rules as CI — Implementation Spec

**Status:** ready for Claude Code
**Date:** 2026-07-18
**Depends on:** nothing shipped — this creates the repo's first CI workflow.
**Related:** `docs/specs/zero-states-spec.md` (bare-`.btn` hardening overlaps rule DL-BTN-01),
`docs/specs/orders-texture-pass-spec.md` (mono demotion + one-red-per-level are the source of
rules DL-MONO-\* and DL-RED-01), `DESIGN.md` in the Open Design project (budgets and voice).

## 1. Goal

Turn the design rules we keep re-litigating in review into automated checks that fail CI.
Every rule below has already been violated at least once in shipped code (file:line receipts
in §4). The system has two layers:

- **Layer 1 — static lint** (`scripts/lint-design.ts`): parses CSS + TSX source. Fast
  (<2s), no browser, runs on every push. Catches declarations at authoring time.
- **Layer 2 — computed-style assertions** (`scripts/assert-design.ts`): drives the built app
  with Playwright and asserts on `getComputedStyle` results. Catches what the cascade
  actually produces (inherited tracking, token overrides, fork leakage). Runs on PRs.

Both layers report violations against a **baseline file** so existing debt doesn't block CI
on day one — only *new* violations fail, and the baseline ratchets down (§6).

## 2. Constraints from the repo (verified 2026-07-18)

- No `.github/workflows/` exists. This spec creates the first one.
- Dev deps already include `playwright` (the library, **not** `@playwright/test`) and `tsx`.
  Layer 2 reuses the plain-Playwright pattern from `scripts/capture-screenshots.ts` (context
  builder, localStorage seeding, `--local` flag) rather than introducing the test runner.
- Add `postcss` as an explicit devDependency for Layer 1's CSS parsing (vite bundles it
  transitively but we must not import from vite's node_modules graph).
- CSS files in scope: `src/tokens.css`, `src/index.css`, `src/App.css`,
  `src/features/{card-purchase/buy-flow,collection/CollectionPage,onboarding/OnboardingModal,orders/OrdersPage,orders/NewOrderSheet,profile/ProfileExportImport}.css`.
- TSX in scope: all of `src/**/*.tsx`.

### Known token forks (grounding for DL-TOKEN-02)

1. **`src/index.css` is leftover Vite-template styling** with its own `:root`: purple
   `--accent: #aa3bff`, its own `--mono`/`--sans`, `font: 18px/145%`,
   `letter-spacing: 0.18px`, and `color-scheme: light dark` with a
   `prefers-color-scheme` dark block. It is imported **first** (`main.tsx:3`), before
   `tokens.css` (`App.tsx:2`), so anything tokens.css doesn't explicitly override leaks
   into the app (root font size/tracking, color-scheme). This is pre-work P0 (§5).
2. **`OrdersPage.css` `--ocard-*` namespace** — 8 local tokens (`--ocard-bg`, `-border-strong`,
   `-dim`, `-expanded`, `-hairline`, `-hover`, `-mono`, `-muted`) plus local semantic tokens
   `--ok`, `--ok-soft`, `--warn-soft`, `--danger-soft`, `--accent-soft`, `--accent-border-clr`.
3. **No `--font-mono` token exists in `tokens.css` at all.** Mono is expressed as literal
   `ui-monospace, monospace` in 9+ places (buy-flow.css:409,468; CollectionPage.css:176,421,430,515;
   App.css:220,1898; ProfileExportImport.css:61) plus `var(--ocard-mono)` and index.css's `--mono`.

## 3. Deliverables

| File | Purpose |
|---|---|
| `scripts/lint-design.ts` | Layer 1 static lint (run: `npm run lint:design`) |
| `scripts/assert-design.ts` | Layer 2 Playwright computed-style assertions (run: `npm run test:design`) |
| `scripts/design-rules.config.ts` | Shared rule config: token color table, red family, allowlists, budgets |
| `scripts/design-lint-baseline.json` | Frozen existing violations (rule id → array of `file:selector` or `state:selector` keys) |
| `.github/workflows/ci.yml` | First CI workflow: `eslint` + `vitest` + `lint:design` on push; `test:design` on PR |
| `package.json` | Add scripts `lint:design`, `test:design`; add devDep `postcss` |

## 4. Rule catalog

Rule ids are stable and appear in lint output, the baseline file, and future allowlist
comments (`/* dl-allow: DL-CAPS-01 — reason */` on the preceding line suppresses one hit;
`data-dl-allow="DL-RED-01"` in markup for Layer 2).

### DL-MONO-01 — mono declared outside the token (Layer 1, error)

Any `font-family` declaration whose value contains `monospace`/`ui-monospace`/`Menlo`/
`Consolas` outside `src/tokens.css`. Sanctioned form after pre-work: `font-family: var(--font-mono)`.

- Current violations (→ baseline): the 9 literal declarations listed in §2.3, plus
  `--ocard-mono`'s definition and `--mono` in index.css.
- Rationale: mono is a semantic tool ("mono carries the numbers"); a literal stack can't be
  themed or audited.

### DL-MONO-02 — mono on prose (Layer 2, error)

For every element whose computed `font-family` resolves to a monospace stack and which has
direct text content: the text must match the **data-atom pattern** or the element must match
the data-atom selector allowlist.

Data-atom pattern (any of):
- numeric/currency/percent: `/^[$€£]?[\d,.\s]+%?$/`
- qty/count forms: `/^[×x]?\d+([\/·]\d+)?$/`
- tracking/ID-ish: `/^[A-Z0-9]{2}[A-Z0-9·\s-]{4,}$/`
- dates-as-data: `/^(\d{1,2}\s)?[A-Z][a-z]{2}(\s\d{1,2})?(,?\s\d{4})?$/` (e.g. "Jun 11", "11 Jun 2026")
- eyebrow label: uppercase, ≤3 words, ≤24 chars, and `text-transform: uppercase` is set
- em-dash placeholder: `/^[—–-]$/`

Allowlisted selectors regardless of content: `.import-textarea`, `.bulk-textarea` (mono
textareas for CSV/list paste are machine-format input, not prose), `code`, `kbd`.

Anything else — a full sentence, a vendor name in a paragraph, help copy — fails.
This is the enforcement of the orders-texture-pass mono demotion: prose is body face, always.

### DL-RED-01 — one red signal per level (Layer 2, error)

Within one **level container**, at most one visually distinct red signal.

- Red family (dark): `--danger #e05353`, `--src-buy-fg #f87171`; (light): `#c43d3d`,
  `#dc2626`; plus any `rgba()` whose channels match 224,83,83 or 239,68,68 or 248,113,113.
  Match on computed `color`, `background-color`, `border-color` with alpha ≥ 0.5 for text/border
  and ≥ 0.10 for backgrounds. Config table in `design-rules.config.ts`; keep the
  `--danger` ≠ `--src-buy-fg` distinction — both are red *family*, both count toward the budget.
- Level containers (selector list in config): `.order-card` / `.ocard`, `.card-row`,
  `.collection-row`, `.deck-item`, page header (`header`, `.page-header`), sheet/modal footer,
  the nav bar. One "red signal" = one connected element cluster (a pill whose bg+text are both
  red is one signal, not two — cluster by DOM containment).
- A level with a "Need to buy" pill AND a red destructive button AND a red LATE badge = 3
  signals = 2 violations.

Static complement (Layer 1, warning): three or more red-family declarations in one CSS rule
block sequence targeting the same component prefix (heuristic; the runtime rule is authoritative).

### DL-BTN-01 — bare `.btn` without variant (Layer 1, error)

In TSX: any `className` string-literal or template containing the standalone class `btn`
without a sibling `btn-*` variant class (`btn-primary`, `btn-secondary`, `btn-ghost`,
`btn-danger`, …). JSX attribute scan via regex is acceptable (`/className=\{?["'`][^"'`]*\bbtn\b(?![-\w])[^"'`]*["'`]/` then check for `btn-`); a
`@typescript-eslint` AST walk is the stretch version, not required.

- Current violations (→ baseline until zero-states-spec ships its hardening):
  `src/features/orders/OrdersPage.tsx:270`, `:274`, `:820`.

### DL-CAPS-01 — uppercase without ≥0.06em tracking (Layer 1 + Layer 2, error)

- Layer 1: any rule block with `text-transform: uppercase` must declare
  `letter-spacing` ≥ `0.06em` **in the same block**. Flags omissions and sub-floor values.
- Layer 2 (authoritative): every element with computed `text-transform: uppercase` and text
  content must have computed letter-spacing ≥ 0.06 × font-size. Catches inheritance gaps
  Layer 1 can't see.
- Floor is **0.06em** (CI gate); the DESIGN.md norm for eyebrows stays **0.08em** (style
  guidance, not CI-enforced — don't fail 0.07em).
- Current violations (→ baseline): App.css:242 (.05em), :1137 (.05em), :1184 (.05em),
  :1761 (.04em), :1920 (.04em), :2462 (.05em), OrdersPage.css:305 (.04em on uppercase carrier
  chip — verify uppercase applies), plus the blocks around App.css:2271/2369/2404 whose
  tracking (if any) is inherited — Layer 2 will give the true list on first run.

### DL-ACCENT-01 — accent overuse (Layer 2, warning → error after ratchet)

Per screen state: count **loud accent uses** = visible elements where `--accent` (current
accent variant, read from the resolved custom property) appears as a *solid* text color or
*solid/near-solid* (alpha ≥ 0.5) fill or border, clustered like DL-RED-01. Budget: **2 per
viewport** (DESIGN.md principle 2: progress + primary CTA), configurable per state in
`design-rules.config.ts` (e.g. nav active-tab underline is exempted globally as chrome).
Translucent tints (`--accent-tint-10/12/35`, `--accent-dim`) do **not** count.

Start as warning; flip to error once the per-state budgets are tuned against the real
screenshot states (one calibration run, then commit budgets).

### DL-TOKEN-01 — hardcoded literals of token colors (Layer 1, error)

Any hex or `rgba()` literal outside `src/tokens.css` whose value matches a token color
(exact hex, or rgba channels matching a token's RGB at any alpha). Token table generated
into `design-rules.config.ts` from tokens.css values — accent family, status colors, source
tags, red family, surfaces.

- Current violations (→ baseline, ~30 hits): `rgba(224,83,83,*)` × ~18 (App.css 622–1971,
  CollectionPage.css 287–538, ProfileExportImport.css 77–107), `rgba(108,92,231,*)` × ~9
  (App.css 445–1894, CollectionPage.css 178/423, buy-flow.css 219/220/532), literal
  `#e05353` at App.css:1872 and buy-flow.css:284.
- Sanctioned replacement: `color-mix` tint tokens in tokens.css. `--accent-tint-10/12/35`
  already exist; pre-work adds the missing ones (§5). The fix for a violation is *always*
  "add/use a tint token", never "inline a different rgba".

### DL-TOKEN-02 — custom-property definitions outside tokens.css (Layer 1, warning)

Any `--*:` definition outside `src/tokens.css`. Component-scoped **aliases of global tokens**
(e.g. `--ocard-hairline: var(--border-dim)`) are tolerable and get allowlist entries;
definitions introducing *new raw values* are the smell. Baseline: the `--ocard-*` namespace +
`--ok/--warn-soft/--danger-soft/--accent-soft/--accent-border-clr` in OrdersPage.css, and all
of index.css's `:root` (which pre-work deletes anyway).

### DL-CONTRAST-01 — text contrast against the painted backdrop (Layer 2, error — gated in CI)

**Status: gate (was report-only). Gated since #138; baseline 0 failing pairs in all four themes, confirmed 2026-10-23.**

For every visible text element on a captured state (including the popover, sheet and hover states
`scripts/capture-screenshots.ts` opens), compute `color` against the backdrop actually painted behind it
(ancestor `background-color`s composited bottom-up, alpha and ancestor `opacity` included) and fail
anything under WCAG AA: **4.5:1**, or **3:1** for large text (>= 24px, or >= 18.5px bold). Input and
textarea values and `::placeholder` count. Transitions are allowed to settle first, so a mid-fade frame
never reports.

- States it covers: dark indigo, light indigo, dark ember, light sapphire (two accents × both modes, so
  the `--on-accent` and `--accent-text` pairs are all exercised).
- **Exemptions** (the only ones; everything else must pass):
  1. *Disabled controls* — exempt under WCAG; skipped automatically.
  2. *Decorative elements* — separators (`·`), chevrons, arrows, empty-state dashes, unavailable alpha-rail
     letters. Mark the element `data-contrast-exempt`. It must carry no information that isn't available
     elsewhere (an `aria-hidden` or a visible equivalent). Don't use it for real labels.
  Completed (`acquired`) rows and cancelled orders are not exempt: they fade by colour (`--text-dim` text,
  neutral status pill, muted checkbox and mana dots, strikethrough) at full opacity, so they hold 4.5:1.
- Not judged, and counted so the report says so: elements covered at their centre (content behind a scrim or
  open popover) and text over a gradient/image backdrop.
- **Gate.** `npm run test:contrast` (`scripts/contrast-gate.sh`) starts the dev server, runs
  `capture-screenshots.ts --local --contrast-gate` per combination and exits 1 on any hit or failed shot.
  `.github/workflows/ci.yml` runs it as a `contrast` matrix job (one per combination). Without `--contrast-gate`
  the same flag set (`--contrast`) is report-only and writes `contrast-report.json` beside the screenshots.
  Page-side logic: `scripts/contrast-audit.ts`. When `scripts/assert-design.ts` exists this becomes one of its
  assertions, reusing the same audit function.

## 5. Pre-work (small, do first — shrinks the baseline before freezing it)

1. **P0 — purge the Vite-template `src/index.css`.** Keep only `#root` layout scaffolding
   actually used by the app; delete the template `:root` (purple accent, 18px font,
   0.18px tracking, `color-scheme`, `prefers-color-scheme` block, `#social` rules). Verify
   with `npm run screenshots:local` before/after — expected effect is nil because tokens.css
   overrides most of it, but root font-size/tracking may shift unstyled elements; eyeball the
   diff. If `color-scheme` removal changes form-control rendering, re-add
   `color-scheme: dark` / `light` under the proper `html[data-mode]` hooks in tokens.css.
2. **Add `--font-mono` to tokens.css** (`ui-monospace, 'SF Mono', Menlo, Consolas, monospace`)
   and mechanically replace the 9 literal stacks + point `--ocard-mono` at it.
3. **Add missing tint tokens**: `--danger-tint-08/12/15/20/30` and `--accent-tint-20`
   (App.css:445 already *references* `--accent-tint-20` with an rgba fallback — the token
   doesn't exist yet, which proves the demand).

Items 2–3 are mechanical and make DL-MONO-01/DL-TOKEN-01 baselines dramatically smaller.
If time is short, pre-work can be skipped and everything frozen into the baseline instead —
the ratchet still guarantees no new debt.

## 5b. Scale baseline (start of the type and radius cleanup)

Counted 2026-10-23 on `chore/tokens-consolidation`, i.e. after the token-drift cleanup PRs 1–4
(colour, shadow, scrim and font-family are already tokenised; the font-size and radius scales are
**not** touched yet). Source: `grep` over `src/**/*.css`, `tokens.css` excluded. These are the numbers
the ratchet starts from; the cleanup should only move them down.

**Font sizes** — 494 `font-size: Npx` declarations, **23 distinct values**, plus 22 `font: Npx/…`
shorthands (adds 10.5px). Suggested scale: 10 / 11 / 12 / 13 / 14 / 16 / 20 / 24 / 32.

| px | uses | | px | uses | | px | uses |
|---|---|---|---|---|---|---|---|
| 7 | 1 | | 12 | 107 | | 20 | 7 |
| 8 | 1 | | 12.5 | 14 | | 22 | 5 |
| 9 | 6 | | 13 | 109 | | 24 | 5 |
| 9.5 | 2 | | 13.5 | 5 | | 28 | 1 |
| 10 | 33 | | 14 | 49 | | 32 | 1 |
| 11 | 76 | | 15 | 30 | | 36 | 1 |
| 11.5 | 4 | | 16 | 23 | | 56 | 1 |
| | | | 17 | 4 | | | |
| | | | 18 | 9 | | | |

Off-scale and first to fold: the half-steps (9.5, 11.5, 12.5, 13.5 — 25 uses), 15 and 17 (34 uses),
and 7–9px (8 uses; below readable minimums).

**Radii** — 137 single-value `border-radius: Npx` declarations over **13 distinct values**
(1, 2, 3, 4, 5, 7, 8, 9, 10, 14, 20, 99, 999). Tokens exist for 3 / 4 / 6 / 8 / 12 / pill and are used
(`--radius` ×62, `--radius-sm` ×16, `--radius-md` ×20, `--radius-lg` ×7, `--radius-pill` ×7, `--radius-xs` ×1);
6px and 12px were swapped to `--radius-md` / `--radius-lg` in PR 4 (same values, no visual change).
Still raw: `4px` ×36 and `8px` ×21 (equal to `--radius-sm` / `--radius`), `3px` ×12, `2px` ×11, `5px` ×10,
`10px` ×6, `9px` ×5, `7px` ×2, `14px` ×2, `20px` ×1, `1px` ×1, and pills at `999px` ×10 and `99px` ×8
(→ `--radius-pill`). `50%` ×31 is a circle, not a scale value. Multi-value top-corner radii
(`16px 16px 0 0` ×8, `18px 18px 0 0` ×2, `8px 8px 0 0`, `0 0 8px 8px` ×2) are sheet/tab shapes.

## 6. Baseline + ratchet mechanics

- First run of each layer with `--update-baseline` writes `design-lint-baseline.json`:
  `{ "DL-TOKEN-01": ["src/App.css:622", …], "DL-MONO-02": ["deck-desktop-dark:.ocard-note", …] }`.
  Layer 2 keys are `state:selectorPath` (state = the screenshot-state name), so they're
  stable across runs with seeded data.
- CI compares current violations against baseline: **new key ⇒ fail** (exit 1, print rule id,
  location, the rule's one-line rationale, and the sanctioned fix). **Fixed key ⇒ warn**
  "baseline entry stale — run with --update-baseline to ratchet" (keeps baseline honest;
  optionally `--strict-baseline` fails on stale entries later).
- Layer 2 runs against `vite build && vite preview` (production CSS, port 4173), seeding
  localStorage from `test-data/` the same way `capture-screenshots.ts --local` does. Reuse
  its context-builder by extracting the shared parts into `scripts/lib/app-context.ts` —
  do not fork a second seeding path. States to assert: the core six
  (deck desktop/mobile, collection desktop/mobile, orders desktop/mobile) × dark + light.

## 7. CI workflow

`.github/workflows/ci.yml`:

- **push (all branches):** `npm ci` → `eslint .` → `vitest run` → `npm run lint:design`.
- **pull_request:** the above + `npx playwright install chromium --with-deps` →
  `npm run test:design`.
- Node 22, npm cache on. No deploy steps — `npm run deploy` stays manual/wrangler.

## 8. Acceptance criteria

1. `npm run lint:design` exits 0 on current `main` after baseline freeze; introducing any of
   these one-liners makes it exit 1: a `font-family: monospace` in a feature CSS, a
   `rgba(224,83,83,.1)`, a `text-transform: uppercase` block without tracking, a
   `className="btn"`, a new `--foo: #123456` outside tokens.css.
2. `npm run test:design` exits 0 on current `main` after baseline freeze; wrapping prose in a
   mono class, or adding a second red pill inside an order card, makes it exit 1 with the
   state + selector named.
3. CI runs green on a no-op PR; red on a PR containing any seeded violation from (1)/(2).
4. Lint output lines are `file:line rule-id message` (or `state selector rule-id message`)
   so editors and CI annotations can link them.
5. No rule contradicts standing decisions: Orders keeps its ledger anatomy (no layout
   assertions in this spec — rules are token/typography/color-level only); "Fetched"="Owned"
   voice is untouched; `--danger` vs `--src-buy-fg` stay distinct tokens (both merely count
   toward the same red budget).
