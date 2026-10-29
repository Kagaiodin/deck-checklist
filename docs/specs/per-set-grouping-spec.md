# Collection: Group by Set — Tech Spec

Issue: #45 (followup from the Collection Page Design Review §06). Related: #36 (set/CN enrichment), #82 (pill label rename).

## Vision check

Serves set-completion goals ("how much of WAR do I have?") on the Collection page. Adds one sort option and no new data model.

## Scope (v1)

A **Group by set** option in the collection sort popover. When active, the list shows one sticky, collapsible header per set with that set's printings nested beneath it.

## Facts established from the code

- `CollectionSortKey` (`src/types/collection.ts`) is `"name-asc" | "name-desc" | "qty-desc" | "qty-asc"`. Options are listed in `SortPopover.tsx`.
- Sort state lives in `useCollectionSort` and is not persisted. There is no localStorage key to add and nothing to change in `MANAGED_KEYS`.
- The list is a single `Virtuoso` in `CollectionPage.tsx` with one row per card name; each entry has a `printings[]` array.
- `AlphaRail` renders only when `alphaSort` (name sorts) is true.
- The demo collection already carries set data, so the feature works in demo mode as-is.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Mechanism | New sort key `set` in `CollectionSortKey`, added to the existing sort popover as "Group by set". No separate control. |
| 2 | Multi-printing cards | Each printing is listed under its own set. A card owned in 3 sets appears in 3 groups. |
| 3 | Header text | `WAR — 47 cards (52 copies)`: unique cards first, then total copies. |
| 4 | Set order | Alphabetical by set code. The Unknown group is always last. |
| 5 | Set label | Set code only. No full set names in v1. |
| 6 | Missing set | Printings with no `set` go in a trailing **Unknown set** group. |
| 7 | Order within a set | Collector number (numeric-aware), tie-break and fallback by name. |
| 8 | Alpha rail / search / pills | Alpha rail hidden under set grouping. Search and filter pills keep working; empty groups are dropped. |
| 9 | Headers | Sticky, via `GroupedVirtuoso`, rather than mixed row types in a plain `Virtuoso`. |
| 10 | Collapsing | Tapping a header collapses or expands its group. |
| 11 | Completion figure | Out of scope: needs per-set totals from Scryfall. Headers show owned counts only. |
| 12 | Filter order | Filter first, then group, so header counts reflect the active search and pill. |
| 13 | Default collapse state | All groups start expanded. |
| 14 | Persistence | Collapse state is component state only. It resets on leaving the page or changing sort. Nothing is saved. |
| 15 | Bulk control | One "Collapse all / Expand all" text button next to the sort control, visible only in set mode. |
| 16 | Header a11y | The whole header is a `<button>` with `aria-expanded` and a chevron; Enter and Space toggle it. A collapsed header keeps its count text. |
| 17 | Search while collapsed | An active search forces all groups open. The manual collapsed state returns when the search is cleared. |

## Behavior

1. User opens the sort popover and picks **Group by set**.
2. The list is filtered by the active search and pill, then grouped by set (decision 12).
3. Each group renders a sticky header followed by its printings, sorted per decision 7.
4. Tapping a header toggles that group. **Collapse all / Expand all** toggles every group at once.
5. While a search is active, every group renders expanded regardless of collapse state (decision 17).
6. Switching to any other sort restores the flat list, the alpha rail, and clears collapse state.

## Implementation notes

- Add a pure util, e.g. `groupCollectionBySet(entries)` in `src/utils/`, returning ordered `{ set, cards, copies, printings }[]`. Keep it separate from React so it is directly testable.
- `GroupedVirtuoso` takes `groupCounts`, `groupContent`, and `itemContent`. A collapsed group contributes a count of 0.
- Hide the alpha rail via the existing `alphaSort` check; `set` is not an alpha sort, so no change is expected beyond verifying it.
- **Risk:** row actions (qty edit, delete, undo) must act on the specific printing shown, not the whole card, because one card can now appear in several groups. Verify the existing handlers during implementation and fix them if they act on the whole card.
- The "Free" pill and other filters apply per printing. A printing in a group counts only if it passes the active filter.

## Tests

- `groupCollectionBySet`: multi-printing placement across sets, Unknown group ordering, collector-number ordering (numeric-aware, name fallback), and counts after filtering.
- `SortPopover`: the new option renders and fires `onSortChange("set")`.
- `CollectionPage`: alpha rail hidden in set mode, header toggles `aria-expanded`, Collapse all / Expand all, and search forcing groups open.
- Demo: no `demoData.test.ts` change expected, since no data shape or managed key changes. Say so in the PR.

## Design handoff

Existing component and small change, so no Open Design run. Before touching source, show an inline HTML mockup of the set header for approval: sticky behavior, count text, chevron, collapsed state, and mobile width. Take colors and spacing from `src/tokens.css`.

## Non-goals / follow-ups

- Release-date set ordering.
- Full set names in headers.
- Set completion figures (owned of total).
- Persisting collapse state.

File these as follow-up issues once v1 ships.
