# Deck Notes — Tech Spec

Tracks issue #TBD (Deck Notes).

## Motivation
User request: a place to record how certain interactions/combos work or how specific cards link together within a deck, plus general free-form notes (deck primer / strategy overview).

## Scope (v1)

- A deck can have **multiple named notes** (not one big textarea) — e.g. "General strategy," "Combo lines," "Sideboard plan."
- A note can carry **structured references to specific cards** in the deck (e.g. a "Combo lines" note referencing the two or three cards involved), in addition to its free-text body.
- Notes live wherever deck metadata is managed today (same store/provider as the deck itself — `DeckProvider` in `src/store/`) and travel with the deck (export/import, Google Drive/local-file backup) since they're part of deck state.

## Data model

```ts
interface DeckNote {
  id: string;
  title: string;          // e.g. "Combo lines"
  body: string;            // free text
  cardRefs: string[];      // card identifiers (from the deck's own card list) this note references
  createdAt: string;
  updatedAt: string;
}
```

- `Deck` gains `notes: DeckNote[]`.
- `cardRefs` point at existing card entries within the same deck — no new card data, just references (e.g. by the deck's existing card id/name key — confirm exact key against current `Card` type in the store before implementation).

## UI surfaces (rough, to refine with inline mockups per CLAUDE.md pattern for existing-component changes)

- Entry point: a "Notes" affordance on the deck view (icon/button, count badge if notes exist).
- Notes panel/sheet: list of named notes, add/edit/delete.
- Card reference picker: when authoring/editing a note, ability to attach 1+ cards from the current deck's list.
- On a card row: optional small indicator if the card is referenced by any note (surfaces the "how cards link together" use case bidirectionally — click through from card to its notes).

## Open questions
- Exact card-id key to use for `cardRefs` (needs a look at the current `Card`/deck type shape before locking the model)
- Whether note ordering is manual (drag) or fixed (creation order, or pinned "general" note first)
- Character/length limits on note body, if any

## Routing
This is a feature on an existing page (deck view), not a new page — per CLAUDE.md, use inline HTML mockup options for the notes UI and get sign-off before touching source, rather than routing through Open Design.

## Grilling session — open decisions (paused, awaiting answers)

Status: grill-me session on #110 paused. No answers recorded yet; each item shows the recommended answer.

### Codebase facts (from exploration)
- Card identity in a deck is `Card.id` (Scryfall UUID). Import dedupes by name → one Card per name with a quantity. Cards carry no collector number (`src/types/index.ts:24-37`, `src/utils/validator.ts:100,128-141`).
- Decks persist as a raw `Deck[]` under localStorage key `mtg-checklist-decks` (`src/App.tsx:1498,1504`). No schema version, no migrations. New optional fields are read with `?? []` (e.g. `notifications?`).
- JSON profile backup serializes `Deck[]` verbatim (`ProfileExport` v1, `src/types/index.ts:127-135`), so notes ride along if they live on `Deck`. Old backups import fine.
- Merge-import only adds decks whose id is not already present; existing decks are not updated (`handleProfileImport`, `src/App.tsx:451-500`). Notes on an existing deck would not merge.
- No deck share link exists. Only Trade has one (`src/utils/tradeShare.ts`). #108 is the only place notes could reach a share link.
- `REMOVE_CARD` filters by id with no cascade (`src/store/decks.ts`), so dangling refs are possible.
- Deck view lives in `src/App.tsx` (not `src/features`). Header actions: `.deck-header-actions` at `App.tsx:1217-1280` (Export, Buy list, Bulk tag, Edit). Sheet patterns: `src/components/CardRowSheet.tsx`, `src/features/card-purchase/BuyListSheet.tsx`.
- New reducer actions extend the `DeckAction` union (`src/store/decks.ts:9-29`); tests go in `src/store/__tests__/decks.test.ts`.

### Questions
| # | Question | Recommended |
|---|---|---|
| Q1 | Supporting annotation layer, or a "primer" destination? | Supporting layer (vision-check: serves acquisition, not a destination) |
| Q2 | How much card awareness in v1? A: free text only. B: named notes + card refs. C: B + indicator on card rows with click-through. | B in v1; C as follow-up (indicator collides with #83/#84 row UI) |
| Q3 | Body format | Plain text, line breaks preserved, ref chips below; inline mentions later |
| Q4 | Entry point | Header button beside Bulk tag/Edit, opens a sheet, count badge |
| Q5 | Referenced card removed from deck | Keep ref, show "(removed)", allow clearing |
| Q6 | Note ordering | Creation order, no drag |
| Q7 | Body length limit | Soft cap ~5,000 chars in the textarea |
| Q8 | `cardRefs` shape | `{ id: string; name: string }[]` (name captured at add time) |
| Q9 | Persistence | `notes?: DeckNote[]`, read with `?? []`, no migration/version bump |
| Q10 | Merge-import ignores notes on existing decks | Accept for v1; any fix is a deck-wide merge change |
| Q11 | Notes in a future share link (#108) | Out of scope for v1; decide explicitly in #108 (notes may be private) |
| Q12 | Reducer shape | Discrete ADD/UPDATE/DELETE_NOTE; no cascade on `REMOVE_CARD` |

### Q2 breakdown
- A: data model + store actions + Notes sheet; no card awareness.
- B: A + card picker in editor, `{id, name}` refs, dangling-ref handling. Satisfies "how cards link together".
- C: B + card-row indicator, id→notes index, and Notes sheet opening at a given note. Touches the most crowded UI and overlaps #83/#84.
- The data model already supports C, so deferring it costs nothing structurally.

### Still to ask once the above is answered
- Test plan and coverage-floor impact (new reducer actions, Notes sheet, picker).
- Mockup options for the Notes sheet (inline HTML, per CLAUDE.md) before touching source.

### Answers
_(fill in as decided)_
