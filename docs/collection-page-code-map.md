# Collection Page — Code Map

## Entry point

- **`src/features/collection/CollectionPage.tsx`** — top-level page component. Mounted in `src/App.tsx` around line 1474 when `view === "collection"`. Props passed from `App.tsx`: `collection`, `collectionMeta`, `setCollection`, `setCollectionMeta`, `decks`.

## Sub-components (`src/features/collection/components/`)

- `CollectionHeader.tsx` — page title, stats summary
- `CollectionControls.tsx` — search, filter, sort controls
- `CollectionRow.tsx` — a single card row in the list
- `CollectionRowDetail.tsx` — expanded row detail (printings, per-deck breakdown)
- `CollectionQuickAdd.tsx` — quick-add card input
- `BulkEditPanel.tsx` — bulk CSV import/edit panel
- `AlphaRail.tsx` — alphabetical jump rail on the side
- `SortPopover.tsx` — sort options popover

## Hooks (`src/features/collection/hooks/`)

- `useCollectionFilter.ts` — filter logic (all / in-deck / free / foils)
- `useCollectionSort.ts` — sort logic
- `useCollectionStats.ts` — derived stats (total cards, unique, etc.)
- `useCommittedInfo.ts` — computes how many copies of a card are committed to decks
- `useBulkEdit.ts` — bulk edit state and preview logic

## Styles

- `src/features/collection/CollectionPage.css` — all collection-specific styles
- Global tokens: `src/tokens.css`; shared layout styles: `src/App.css`

## Types

- **`src/types/collection.ts`** — view-layer types: `CollectionSortKey`, `CollectionFilterKey`, `BulkEditMode`, `CommittedInfo`, `BulkPreview`, `EditingPrinting`
- **`src/types/index.ts`** — data types: `Collection`, `CollectionPrinting`, `CollectionMeta` (grep for these)

## State ownership

`collection` and `collectionMeta` are owned by `App.tsx` in `useLocalStorage` (lines ~129–130), stored under keys `mtg-checklist-collection-v2` and `mtg-checklist-collection-meta-v2`. `CollectionPage` receives them as props and owns all writes to `setCollection`/`setCollectionMeta`.
