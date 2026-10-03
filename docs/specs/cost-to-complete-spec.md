# Cost-to-complete — Spec

Issue: #107 · Branch: `feat/cost-to-complete` · Status: **approved — Variant A (inline line under the bar)**

Live dollar total for the cards still missing from a deck: "41/74 fetched, ~$86 to finish".

## Finding: prices are not stored today
The issue assumes `prices.usd` is already cached. It isn't:
- `ScryfallCard` in `src/utils/validator.ts` has no `prices` field, and `scryfallCardToCard` drops it.
- `Card` (`src/types/index.ts`) has no price field.
- Existing price code (`tradePricing.ts`, `scryfallSearch.ts`) is trade-only and not connected to decks.

So v1 needs a small data change: capture a price at import, and backfill/refresh for decks that already exist.

## Proposed decisions (answers to the issue's open questions)

| Question | Proposal | Why |
|---|---|---|
| What counts toward the total | Cards with `acquired === false` **and** source `need_to_buy` or untagged | Prices the gap only |
| Proxy | Excluded | No purchase planned |
| Ordered | **Excluded** from "to finish", shown as a muted "N ordered" note | Money is already committed; keeps "to finish" meaning "still to spend" |
| Owned / in_another_deck / borrowed / in_binder / in_storage | Excluded | Already have it |
| Owned side | **Never totaled** | Vision check: no collection-value tracking |
| Foil | Use `prices.usd`; fall back to `prices.usd_foil` when null. Decks carry no finish today | Matches how decks track cards |
| Missing price | Card counts as $0 and the total shows "+N unpriced" | Never silently understate |
| Staleness | Store `pricesUpdatedAt` per deck; refetch on deck open when older than 24h; show "Prices as of …" | Zero-cost, no backend |
| Offline / failed fetch | Keep previous prices, mark as stale | Same pattern as the trade calculator |

## Data changes
- `Card.price?: number` — unit price in USD, from Scryfall
- `Deck.pricesUpdatedAt?: number`
- `validator.ts`: add `prices` to `ScryfallCard`, set `price` in `scryfallCardToCard`
- New `refreshDeckPrices(cards)` in `src/utils/`: batches by Scryfall id (75 per request, `Card.id` is the Scryfall id), same pattern as `enrichDeckExtraInfo`; wired next to it in `App.tsx` (~line 209)
- New reducer action `SET_DECK_PRICES` in `src/store/decks.ts`
- Pure helper `computeCostToComplete(cards)` → `{ remaining, missingCount, unpricedCount, orderedCount, pricedCount }` (no deck total, per the vision guard; `pricedCount` tells "prices not loaded" apart from "nothing to buy")

## Display (decided: Variant A)
One line under the progress bar in the strip in `Checklist.tsx`, rendered by a new `CostLine` component. Source: Open Design `cost-to-complete-mockup.html`.

- Mid-build: `~$86 to finish · +2 unpriced · 3 ordered · Prices as of 9:12am`
- Nothing missing: `✓ Nothing left to buy` (plus the ordered note if any)
- Loading, no prices yet: `Loading prices…`; no prices and not loading: render nothing (never a misleading $0)
- Stale (older than 24h, i.e. refresh failed): freshness text turns `--warn` with a warning icon
- No "est." prefix; the `~` carries the estimate
- No new tokens. Dollar figure uses `--font-mono`
- **Vision guard:** no deck total and no count-vs-cost bar (Variants B and C were rejected for footprint and because they add a second bar). Never render total − remaining as a dollar figure.

### Breakdown popover
Follow-up to explain where the figure comes from. The visible line is unchanged; an "incl. untagged" note was considered and rejected. Source: Open Design `cost-line-breakdown-mockup.html`.

- **Trigger:** the `~$X` figure is a `<button>` (`aria-expanded`, `aria-controls` while open, dotted underline, `--surface-2` on hover/open, `:focus-visible` ring). Click, tap or Enter toggles. With a hover-capable pointer (`@media (hover: hover)`), hover opens it after ~150ms; a click on a hover-opened popover pins it. Rendered only when there is a priced total; the loading, empty and done states are unchanged.
- **Content:** header `~$X to finish` + `N cards still missing`; rows `To buy N → ~$A` and `Untagged N → ~$B` (a row is hidden at 0, and A + B equals the headline: the second row is derived from the rounded total so rounding never breaks the sum); optional `No price found N · counted as $0` and `Ordered N · not counted` only when above 0; footer `Estimated from Scryfall's default printing, in USD` plus the freshness label, or the warn icon + `Couldn't refresh. Prices from …` when stale.
- **Counts** are missing copies only, so the untagged count can be lower than the "N untagged" chip.
- **Shell:** `.card-row-popover` look (`--surface-2`, 1px `--border`, 8px radius) with `var(--shadow-menu)`; 264px wide, capped at the viewport minus 24px; anchored below the trigger. No colored dots, no new red.
- **Dismissal (WCAG 1.4.13):** Esc, outside click or touch, or clicking the trigger again closes it; it stays open while the pointer moves from trigger to popover; focus returns to the trigger on Esc.
- **Data:** `computeCostToComplete` also returns `toBuyCount`, `toBuyCost`, `untaggedCount`, `untaggedCost` (`toBuyCost + untaggedCost === remaining`).
- **Rules unchanged:** never show owned value, collection value, a deck total, or total minus remaining; every dollar figure keeps the `~` prefix.

## Tests (per CLAUDE.md)
- `src/utils/__tests__/` — `computeCostToComplete` (tag rules, quantity multiplication, unpriced, ordered note), `refreshDeckPrices` (batching, failed batch keeps prior price)
- `src/store/__tests__/` — `SET_DECK_PRICES`
- `src/components/__tests__/` (or the Checklist feature test folder) — strip renders total, updates when a card is tagged, hides cost when no prices exist yet

## Out of scope
- Totaling owned cards, collection value, or price history
- Per-vendor price comparison
- Currency other than USD
