# Trade Interface — Design Brief (for Open Design)

Companion to `docs/specs/trade-interface-spec.md`. All open questions are now resolved except the "Remaining open item" section (nav placement inside Collection, share-URL length threshold, mobile layout) — read that section before mocking the entry point or nav.

## What we're designing

A video-game-style trade window for Magic: The Gathering cards. Two players, each with an offer panel, and a central control panel. It's a calculator/sandbox, not a marketplace.

## Feel

Playful and slightly nostalgic (think MMO / Pokémon-style trade windows) but it must sit inside the existing app language. Use tokens from `src/tokens.css` (dark default, light overrides, accent variants); do not invent a new palette. The playfulness should come from layout, motion and the fairness meter, not from a separate theme. Aim for minimally invasive additions consistent with the rest of the app.

## Screens / states to mock

1. **Desktop, three panels** — populated, both sides with 4–6 cards, meter showing "leaning".
2. **Empty state** — both sides empty; reuse the shared `EmptyState` component style. Meter in neutral "add cards" state.
3. **Fair state** and **lopsided state** of the meter (show all three bands).
4. **Card row** — thumbnail, name, set/collector number, finish toggle, condition select, quantity stepper, unit price, line total, overflow for discount override and manual price. Show variants: normal, discounted-by-override, manual price, no price available, stale price.
5. **Add-card flows** — (a) Collection picker sheet (My side only) with owned quantities, showing an "N in decks" flag on committed cards (not blocked, just flagged); (b) Scryfall search sheet with autocomplete and a printing picker.
6. **Control panel** — fairness meter, totals for both sides, global discount % (default 10), tolerance % (default 10), per-side discount override, Refresh prices (idle / loading / done / failed), swap sides, clear (with undo), balance suggestion, cash/credit line entry, price freshness indicator, missing-price warning, copy-as-text, bulk condition apply, undo/redo, share. (All of these are confirmed v1 — see the Control-panel table in the spec. The cosmetic "Lock offer" animation was cut from v1; do not design it.)
7. **Per-side discount override** and **per-card discount override** affordances (discoverable but not cluttering).
8. **Share** — copy-link confirmation; **read-only shared view** with banner ("Shared trade — prices as of …") and a "Fork into my own trade" button; error state for a broken link; a **"Copy as text"** fallback UI for when the link is too long (also doubles as its own standalone control-panel action).
9. **Entry point from Collection** — the trade screen is nested under Collection (not a new top-level nav tab). Propose how this reads from `CollectionPage.tsx` without turning Collection into more of a destination — this is a flagged tension in the spec, so sketch 1-2 options here for discussion rather than committing to one.
10. **Mobile** — propose 2–3 options for fitting three panels on a phone (stacked, tabbed Mine/Controls/Theirs, swipe). Recommend one.

## The fairness meter (hero element)

Horizontal split meter, decided with the user:
- A single bar with a center mark. The fill/marker shows each side's share of total value.
- Shows the dollar delta and percent delta, and the band label (Fair / Leaning / Lopsided) with the side it favors.
- Shows "Add $X to even it out" when not fair.
- Color plus a non-color cue (icon/label) for each band, so it works for color-blind users and in both themes.
- Must animate smoothly as cards are added/removed (respect `prefers-reduced-motion`).

## Content and data the designs must accommodate

- Prices shown in USD, two decimals; a card can be "No price".
- Each card row can display: base price, applied discount %, condition adjustment, final unit price. Decide what is shown inline vs. in a popover.
- Long card names, double-faced names (`A // B`), foil/etched treatments.
- A side subtotal, and a missing-price count.
- Quantity up to ~99.
- Refresh timestamp ("Updated 3 min ago").

## Condition & pricing details to reflect

- Condition multiplier table: NM 100% / LP 90% / MP 75% / HP 55% / DMG 40%, applied to fetched price only — a manual price override is shown as-is (no condition adjustment badge on manual-price rows).
- Fairness bands: Fair ≤10%, Leaning 10–25%, Lopsided >25% (tied to defaults above, both configurable).

## Constraints

- Must not display total collection value anywhere.
- No accounts, no real-time presence indicators.
- Works in light and dark and accent variants.
- Accessible: keyboard operable, visible focus, labels for icon buttons, meter has a text alternative.
- Deployed on Cloudflare Workers; purely client-side UI.

## Deliverables

HTML mockups saved to `$OPEN_DESIGN_ARTIFACTS` (local file; Claude Code reads it from disk, never via MCP). Include desktop and mobile, light and dark, and every state listed above.
