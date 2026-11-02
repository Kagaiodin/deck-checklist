# Optional Commander Designation — Tech Spec

Issue: #31. Related: #3 (EDHREC / replacement links), #108 (shareable checklist links).

## Vision check

Serves deck acquisition: the commander is the card a Commander deck is built around, and it still has to be acquired like any other card. This adds one optional field and a pinned display. It does not add rules knowledge, validation, or a new data source.

## Scope (v1)

A deck can optionally have 1–2 commanders. Commanders are shown in a **Commander** section pinned above the rest of the checklist. A Commander-format deck with no commander set shows a small, dismissible nudge in that same slot. Decks without commanders behave exactly as they do today.

## Facts established from the code

- `Deck` (`src/types/index.ts`) has `id`, `name`, `url?`, `format?`, `cards: Card[]`, `createdAt`, `isBuilt?`, `notifications?`, `extraInfo?`, `pricesUpdatedAt?`. `format` is an optional **free-text** string, edited via the "+ format" pill in the deck header (`App.tsx`) or typed at import.
- `Card` has `id`, `name`, `quantity`, `acquired`, `color`, `type`, `source?`, `price?`. Acquisition state lives on the card.
- `parseDecklist` (`src/utils/parser.ts`) returns only `{ count, name }[]`. It has no concept of sections, so it cannot tell commanders from the rest.
- Row actions already have homes: `CardRowOverflowMenu.tsx` (desktop) and `CardRowSheet.tsx` (mobile).
- The store (`src/store/decks.ts`) already has `REMOVE_CARD` and `UPDATE_CARD_QUANTITY`. Orders and the buy flow key off `deckId` and card IDs.
- Nothing in `src/` handles commanders today. The only related code is a regex in `App.tsx` that strips a `Cmdr:` / `EDH:` / `Commander:` prefix from deck names to compute the avatar initial.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Data shape | `commanderIds?: string[]` on `Deck`: at most 2 IDs of cards already in `cards[]`. Absent or empty means no commander. No migration needed. |
| 2 | Designating | Manual only, from an action on a card row already in the deck. Import and `parseDecklist` are unchanged. Import detection is a follow-up. |
| 3 | Counting | The commander stays in `cards[]` and counts toward totals, owned and progress counts as today. Only its placement and styling change. |
| 4 | Availability | On every deck, with no format gating. A nudge appears only when `format` matches Commander and no commander is set (see decisions 14–16). |
| 5 | Out of scope | Scryfall color identity, color-identity validation, and the EDHREC link (#3). Nothing in the data shape blocks them; `Card.color` could feed color identity later. |
| 6 | Row action | "Set as commander" / "Remove commander" added to `CardRowOverflowMenu` (desktop) and `CardRowSheet` (mobile). No new button on the row. |
| 7 | Pinned display | A **Commander** section above all other groups in `Checklist.tsx`. The commander card moves out of its normal group so it never appears twice. The row is a normal row (same tags, price, actions); the only new element is the section header. No hero art or new card styling in v1. |
| 8 | Quantity | The action is offered only on cards with quantity 1. Later quantity edits are not policed. |
| 9 | Limit of two | With two commanders set, the action on any other card is disabled with the hint "Remove a commander first". No auto-replace and no third slot. |
| 10 | Cleanup | `REMOVE_CARD` (and any other action that deletes cards) removes the ID from `commanderIds` in the same reducer step. |
| 11 | Other flows | Buy lists, orders, and progress/cost totals are unchanged; the commander is treated as any other card. Sharing (#108) and deck export are out of scope. `commanderIds` travels in backups as part of the deck JSON. |
| 12 | Demo mode | `commanderIds` set on Selvala Elves and The Ur-Dragon; Korvold Sacrifice is left without one so the demo shows the nudge. No new `MANAGED_KEYS` entry. |
| 13 | Design process | Open Design run commissioned from this spec, then implement from the local artifact. |
| 14 | Nudge content | Text-only in the pinned slot, e.g. "No commander set. Use ⋯ on a card to make it your commander", with a small dismiss ×. No "Choose commander" picker in v1. |
| 15 | Dismissed state | `commanderPromptDismissed?: boolean` on `Deck`. Once dismissed it stays dismissed: clearing a commander or changing the format does not reset it, and there is no "undo dismiss" UI. Setting a commander hides the nudge independently of the flag. |
| 16 | Format matching | `isCommanderFormat(format?: string)` is a pure util: case-insensitive, matches the whole words `commander`, `edh`, or `cmdr` ("Duel Commander" and "EDH" match; "Standard" and blank do not). |
| 17 | Filters and grouping | The Commander section always sits above the groups, whatever the grouping or sort. Existing filters (e.g. hide acquired) apply to it like any other row, so it disappears when its only card is filtered out. |
| 18 | Mobile | Same as desktop: no sticky pinning and no separate layout. "Pinned" means top of the list, not stuck to the viewport. The nudge is full width in the same slot. |
| 19 | Rules in the store | One action, `TOGGLE_COMMANDER { deckId, cardId }`. The reducer enforces the two-commander cap and the quantity-1 rule itself and treats violations as no-ops, so the UI checks in decisions 8 and 9 are not the only guard. |

## Behavior

1. User opens a card's overflow menu (desktop) or row sheet (mobile) and picks **Set as commander**. The reducer adds the card ID to `commanderIds`.
2. `Checklist` renders a **Commander** section above the groups containing the designated card(s), removed from their normal group. Tags, price, and actions work as on any row.
3. **Remove commander** on that row removes the ID; the card returns to its normal group.
4. If `isCommanderFormat(deck.format)` and `commanderIds` is empty and `commanderPromptDismissed` is not true, the Commander slot shows the nudge instead. Dismissing sets `commanderPromptDismissed: true`.
5. With two commanders set, other rows show the action disabled with "Remove a commander first". Cards with quantity above 1 do not offer the action.
6. Deleting a designated card removes its ID from `commanderIds`.

## Implementation notes

- Add `commanderIds?` and `commanderPromptDismissed?` to `Deck`. Add `isCommanderFormat` in `src/utils/` (pure, separate from React so it is directly testable).
- Add `TOGGLE_COMMANDER` and a dismiss action (e.g. `DISMISS_COMMANDER_PROMPT`) to `src/store/decks.ts`. Deleting-card actions must clean `commanderIds`.
- In `Checklist.tsx`, split designated cards out of the normal grouping before the existing filters and grouping run, then render them in the Commander section subject to the same filters (decision 17).
- Demo: set `commanderIds` for decks A and B using the existing ID scheme (`a-selvala-heart-of-the-wilds`, `b-the-ur-dragon`); leave deck C unset. Decks must remain full 100-card lists.
- **Risk:** any code that iterates `deck.cards` by group (progress, buy flow, order creation) must still see the commander. Because it stays in `cards[]` (decision 1), only the grouping step in `Checklist` should change. Verify during implementation.

## Tests

- Reducer: `TOGGLE_COMMANDER` add and remove; cap at two; quantity-above-1 no-op; unknown card ID no-op; `REMOVE_CARD` cleanup; dismiss action.
- `isCommanderFormat`: table of inputs ("commander", "Commander", "EDH", "cmdr", "Duel Commander", "Standard", "", undefined, "commanderless" should not match).
- `Checklist`: Commander section renders above groups and the card is not duplicated; filters apply; the nudge renders for a matching format with no commander; the nudge is hidden when dismissed or when a commander is set.
- `CardRowOverflowMenu` and `CardRowSheet`: action label toggles, is hidden for quantity above 1, and is disabled with the hint at the cap.
- `demoData.test.ts`: every `commanderIds` entry points at a real card in its deck; deck C has none; decks remain 100 cards.

## Design handoff

New section header and placeholder on the existing checklist, so an Open Design run (project `5c6d105f-c086-441b-ad55-2e3403c89799`) with skill `redesign-existing-projects`, then implement from the local artifact. Use only tokens from `src/tokens.css`. The design must cover: the Commander section (one and two commanders), the nudge and its dismiss control, the disabled-at-cap menu state, and 375px mobile.

## Future work

- **Standardized format list.** `format` is currently free text, which is why `isCommanderFormat` has to match loosely. We should build a standardized format list (a picker or enum with aliases) in place of the free-text field. That would let the nudge and any other format-aware behavior key off a known value, and `isCommanderFormat` would shrink to a lookup.
- Detect commanders at import (Moxfield/Archidekt sections).
- Scryfall color identity and validation.
- EDHREC link (#3).
- Render the Commander section in shared checklist views (#108) and in exports.
- A "Choose commander" picker if the text nudge proves too hidden.

File these as follow-up issues once v1 ships.
