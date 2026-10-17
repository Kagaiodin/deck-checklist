# Demo Mode — Tech Spec

Issue: #98. Status: decisions settled via grill, ready for banner mockup.

## Vision check

Let someone show the app, or send someone a link, with realistic data, without exposing or destroying real data. Zero backend, zero new infra (see free-tier constraint). Demo mode costs almost no UI weight and no bundle weight for normal users.

## Scope (v1)

- Two entry points: a ⋮ overflow menu item and a `?demo=true` link
- Curated decks, collection, orders, one trade
- Persistent `Demo mode · [Exit]` banner
- Exit restores the user's real data, or leaves a fresh user on the normal empty states
- Drive and backup actions blocked while active

Out of scope: multiple demo scenarios, offline image caching, sharing demo state between devices, an onboarding tour, a "Reset demo" control (exit and re-enter instead).

## How the data layer constrains the design

`useLocalStorage` (`src/hooks/useLocalStorage.ts`) reads the key **once on mount** and writes in-memory state back on every change. Writing localStorage while the app runs does nothing visible, and the next state change overwrites it.

Decision: enter and exit **write localStorage, then `location.reload()`**. A visible reload is acceptable. A live-swap refactor of every `useLocalStorage` call site is out of scope.

## Storage keys

Managed by demo mode (snapshotted and replaced):

| Key | Demo content |
|---|---|
| `mtg-checklist-decks` | 3 decks |
| `mtg-checklist-collection-v2` | owned / ordered / proxy mix |
| `mtg-checklist-collection-meta-v2` | matching metadata |
| `mtg-checklist-orders-v1` | active, late, received, cancelled |
| `mtg-checklist-vendor-history` | vendors used by demo orders |
| `mtg-checklist-errors` | empty |
| `fetchlist-trade` | **one** lopsided trade (`{ mine, theirs, settings }`) |
| `fetchlist-last-vendor`, `fetchlist-vendor-last-used` | cleared |
| `fetchlist:onboarding:dismissed` | `true` |

Never touched: `fl-theme-mode`, `fl-theme-accent`, `fl-sidebar-collapsed`, `fetchlist:extrainfo-open`.

The buy list has no key. It is derived from unowned deck cards, so demo decks must contain some.

Owned by demo mode:

- `fetchlist:demo:active`: `"true"` while in demo
- `fetchlist:demo:snapshot`: JSON `{ [key]: string | null }` of original raw values (`null` = key was absent, so exit removes it)
- `fetchlist:demo:source`: `"link"` or `"settings"`, used for the exit flow

## Activation

Two entry points, both going through the same `enterDemo` path:

1. **⋮ overflow menu:** a plain "Load sample data" item at the bottom with a one-line hint beneath it. Not in the Appearance popover, which is only about theme. Hidden while demo is active (the banner has Exit).
2. **Link:** `https://<site>/?demo=true`. Meant for sending to someone so they can try the app and then start using it. Read once at startup, then stripped from the URL with `history.replaceState` so a refresh or bookmark does not re-trigger it. If `demo:active` is already set, the param is ignored.

No gesture or key sequence.

## Enter / exit flow

**Enter**
1. If `demo:active` is set, no-op.
2. If any managed key holds non-default data (empty trade, `[]` orders and `{}` collection count as empty), confirm: "Replace your data with sample data? Your data is saved and comes back when you exit." A fresh user skips the confirmation. For the link, the confirmation renders before anything is written.
3. Always snapshot raw strings of all managed keys into `demo:snapshot`.
4. Lazy-load the fixture builder, write demo values, set `demo:active` and `demo:source`, reload.

**Exit**
1. Restore each key from the snapshot (`null` → `removeItem`).
2. Remove the `demo:*` keys, reload.

**Starter flow:** when the user entered via link and had no prior data, Exit lands on the normal empty states (#113). Those states must offer a clear first action (import a deck). Verify they do, and fix them if not. This is an acceptance check, not new UI.

**Failure modes**
- Snapshot write fails (quota): abort enter, leave data untouched.
- `demo:active` set but snapshot missing or corrupt: the banner's Exit clears the managed keys, shows a warning toast, and reloads. Never crash or leave the user stuck.
- Second tab: every tab listens for the `storage` event on `demo:active` and reloads when it changes.

## Edit behavior

Edits made during demo persist across reloads until Exit. Exit restores the snapshot, so edits are discarded.

## Drive and backup isolation

Drive save/load and export/import are manual (`GoogleDriveBackup`, `ProfileExportImport`, `ImportBackupModal`). While `demo:active`:

- Controls are **disabled with a hint** ("Exit demo mode to back up your data"), not hidden.
- The underlying functions are also guarded, so no code path can write demo data to Drive or a file.

## Banner

Slim strip at the very top of the viewport on all breakpoints, above the existing layout: `Demo mode · [Exit]`. Approved treatment: mockup option A (solid `--accent` strip, white text, outlined-pill Exit; 44px tall on mobile). See `demo-mode-design-brief.md` and `demo-mode-mockups.html`. Use `src/tokens.css` tokens; check it with the sidebar layout and on mobile.

## Demo data requirements

Fixture in `src/features/demo/demoData.ts` as typed objects (not a pasted console script), type-checked against `Deck`, `Order`, `Collection`, `Trade`.

- Deck A, nearly done: high progress, priced remaining cards, Built tag set
- Deck B, mid-build: partial progress, 5-color commander (mana pie), some cards ordered
- Deck C, just started: mostly unchecked, many unowned cards (feeds the buy list)
- Orders: seed from `test-data/load-orders.js` (commit it first). Dates are generated **relative to now** by `buildDemoData(now)`, because the hardcoded 2025 timestamps would make every order ancient.
- Collection: owned, ordered, and proxy cards consistent with the decks and orders
- Trade: one lopsided trade with priced cards on each side and a small cash line
- Prices: static `price` values on cards, so cost-to-complete works with no Scryfall calls
- Images: load from Scryfall as normal. No offline caching in v1.

## Bundle weight

The fixture builder is lazy-loaded via dynamic `import()` when the user triggers demo mode. Only the `demo:active` flag check, the `?demo=true` check and `DemoBanner` ship in the main bundle.

## Module layout

- `src/features/demo/demoData.ts`: `buildDemoData(now)`
- `src/features/demo/demoMode.ts`: pure `enterDemo(storage, now)`, `exitDemo(storage)`, `isDemoActive(storage)` taking a `Storage` so they are testable
- `src/features/demo/DemoBanner.tsx`
- `src/features/demo/__tests__/`

## Testing

- `demoMode`: snapshot captures present and absent keys; exit restores exactly (including removal of originally absent keys); enter is a no-op when active; abort on quota failure; corrupt-snapshot recovery; confirmation only when non-default data exists
- `?demo=true`: activates for a fresh user, is stripped from the URL, is ignored when already active, requires confirmation when real data exists
- `buildDemoData`: validates shape, orders cover all four statuses, buy list non-empty, dates relative to `now`
- `DemoBanner`: renders only when active; Exit calls `exitDemo`
- Drive and export controls disabled, and functions guarded, in demo mode
- Multi-tab: `storage` event on `demo:active` triggers reload

## Decisions log (from grill)

| Question | Decision |
|---|---|
| Activation | ⋮ overflow menu item (moved out of the Appearance popover after manual QA) **and** `?demo=true` (reversed from the first grill answer so a sent link works) |
| Enter/exit mechanism | Write storage + reload; no live swap |
| Bundle | Lazy-load fixture |
| Edits during demo | Persist until Exit |
| Second tab | `storage` event reload |
| Trade | One lopsided trade |
| Confirmation | Only when non-default data exists; always snapshot |
| Drive/backup | Disabled with hint + function guard |
| Banner | Slim top strip, all breakpoints; mockup option A (accent strip) approved |
| Dates / images | Relative to now / Scryfall as normal |
| Broken state | Exit clears managed keys, warns, reloads |
