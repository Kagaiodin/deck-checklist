---
name: run-deck-checklist
description: Run, start, drive, smoke-test or screenshot the deck-checklist web app (React/Vite) in headless Chromium with sample data seeded. Use to see a UI change working, check a view at a given width, or exercise the order receive/cancel flow in the real app instead of just the test suite.
---

# Run deck-checklist

A Vite + React single-page app; all state is in `localStorage`. The agent path is `driver.mts`: it seeds the demo
dataset as ordinary data (demo mode stays off), opens a view in headless Chromium, optionally runs a flow, takes a
screenshot, and exits non-zero on any console or page error. Paths below are relative to the repo root.
Verified on macOS with the repo's own `node_modules/playwright`; not tried in a Linux container.

## Run (agent path)

```bash
npx tsx .claude/skills/run-deck-checklist/driver.mts --view collection --width 375
```

Flags: `--view decks|collection|orders` (default `decks`), `--width <px>` (default 1280), `--flow orders|backup`,
`--empty` (seed nothing: first-run state), `--out <dir>` (default `/tmp/deck-checklist-shots`).
The screenshot path is printed, e.g. `/tmp/deck-checklist-shots/collection-375.png`.

```bash
# Order receive/cancel end to end: marks an order received, cancels another, asserts localStorage
# (order status, collection merge, order_cancelled deck notification) and that it survives a reload.
npx tsx .claude/skills/run-deck-checklist/driver.mts --view orders --flow orders
# prints: flow orders: OK (received, cancelled, persisted across reload)

# Backup import: merge-imports a file with one new deck while a second tab is open; asserts both tabs
# reload, the "Import complete" toast shows after the reload, and the deck is saved.
npx tsx .claude/skills/run-deck-checklist/driver.mts --flow backup
# prints: flow backup: OK (merged, reloaded both tabs, toast after reload)
```

The driver uses an existing dev server on `:5173` if one is up (it serves whatever branch the working tree is on),
otherwise starts `vite --port 5173 --strictPort` and stops it on exit.

To add a flow, extend the `FLOW` block in `driver.mts`: read state with `read(page)` (orders, collection, decks from
`localStorage`), act through the UI, assert on storage. Keep seeding as is.

## Run (human path)

`npm run dev`, open http://localhost:5173 (useless headless; use the driver).

## Tests

`npm test` (vitest, jsdom), `npm run verify` (build + coverage, what CI runs), `npm run test:a11y`.

## Gotchas

- **Seed once per tab.** The init script guards on `sessionStorage` so a `page.reload()` keeps what the app wrote;
  without the guard every reload would reset orders and collection.
- **Demo data, not demo mode.** `buildDemoData` is written straight into the real keys. Don't toggle demo mode for
  this: it blocks backup imports and snapshots/restores the keys.
- **The driver must stay `.mts`.** `tsx` treats a plain `.ts` outside a `"type": "module"` package as CJS and rejects
  its top-level `await`.
- **Order actions.** The driver hovers the collapsed row before clicking its "Mark received" button, and expands the
  row (click the vendor name) before "Cancel order". Copy that sequence in new flows.
- **A server already on `:5173` may be someone else's session.** It follows the working tree via HMR, so check
  `git branch --show-current` before trusting a screenshot.
- Screenshots go to `/tmp` by default; read them rather than assuming. Per CLAUDE.md, review images in a subagent.

## Troubleshooting

- `AssertionError: --view must be one of decks, collection, orders`: the flag was misspelled.
