# Merge Conflict Resolutions — beta-features

Recorded 2026-05-21. Three PRs merged into `beta-features` in order: #39 → #47 → #48.

---

## PR #39 — `feature/12-order-tracking` → `beta-features`

Six conflict markers across three files. All were minor naming/style divergences between `beta-features` and the order-tracking branch.

---

### `src/components/Checklist.tsx` — line 651

**What conflicted:** The "All printings" Scryfall link anchor tag. `beta-features` had a simple inline text node; order-tracking wrapped the label text in a `<span className="card-printings-label">` so it could be hidden on mobile via CSS.

**Resolution:** Kept the order-tracking version (span-wrapped label) because the companion CSS rule `.card-printings-label { display: none }` at `@media (max-width: 639px)` needed the span to exist in order to work correctly.

---

### `src/App.tsx` — line 832

**What conflicted:** The feedback button's inner span class names. `beta-features` used `feedback-btn-full` / `feedback-btn-icon`; order-tracking used `feedback-label-full` / `feedback-label-short`.

**Resolution:** Kept the order-tracking class names (`feedback-label-full` / `feedback-label-short`) because the existing CSS in `App.css` already defined those selectors (lines 47–48, 57–58). The `beta-features` class names were orphaned — no CSS rules targeted them.

---

### `src/App.css` — line 27 (`.app-header`)

**What conflicted:** Whitespace formatting only. Both sides were identical in substance (`display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap`) — one wrote it on a single line, the other split across two lines.

**Resolution:** Kept the single-line version from `beta-features` (no functional difference).

---

### `src/App.css` — line 58 (mobile `@media (max-width: 479px)`)

**What conflicted:** Two different sets of mobile overrides:
- `beta-features`: `.app-logo-text { display: none }`, `.app-logo-icon { height: 32px }`, `.app-nav { gap: 4px }`
- order-tracking: `.app-logo { max-width: 120px }`, `.feedback-label-short { display: inline }`, `.feedback-label-full { display: none }`

These were genuinely different rules targeting different elements; neither side superseded the other.

**Resolution:** Kept all rules from both sides. The logo rules from `beta-features` and the feedback-label responsive rules from order-tracking are complementary and non-overlapping.

---

### `src/App.css` — line 528 (`.card-printings-link` block)

**What conflicted:** `beta-features` had nothing after the `.card-printings-link:hover` rule; order-tracking added a `@media (max-width: 639px)` block that hides the label text and enlarges the touch target on mobile.

**Resolution:** Kept the order-tracking media query block. Required by the `card-printings-label` span resolution in `Checklist.tsx` above.

---

### `src/App.css` — line 924 (touch-device nav button sizing)

**What conflicted:** Both sides targeted `.nav-btn` inside a touch-device media query, but with different values:
- `beta-features`: `padding: 10px 14px; font-size: 13px`
- order-tracking: `padding: 7px 10px; font-size: 12px` (comment: "compact so they fit in the 56px header")

**Resolution:** Kept the order-tracking values. The order-tracking branch added a third "Orders" nav tab, making the header more crowded. The more compact padding was intentionally chosen to keep all three tabs fitting within the fixed 56px header height on mobile.

---

## PR #47 — `refactor/collection-feature-split` → `beta-features`

Four conflict markers across two files. The core issue was architectural: PR #47 extracted all collection logic out of `App.tsx` into `src/features/collection/`, while the previously merged PR #39 still relied on collection state living in `App.tsx` (specifically `handleMarkReceived` writes merged order cards into the collection).

---

### `src/App.tsx` — line 11 (imports)

**What conflicted:**
- HEAD (post-#39): Imported `Order`, `OrderCard`, `DeckNotification`, `Carrier` types; `mergeOrderCardsIntoCollection` from csvParser; carrier utilities; order helper functions.
- collection-refactor: Imported only `Collection` type (no order types); imported `CollectionPage` component; dropped carrier/order imports entirely.

**Resolution:** Merged both sides. Kept all order types, carrier utilities, order helper functions, and `mergeOrderCardsIntoCollection` from HEAD. Added the `CollectionPage` import from the refactor branch. Dropped `parseCollectionCSV` from the refactor side since `CollectionPage` handles CSV parsing internally.

---

### `src/App.tsx` — line 80 (state declarations)

**What conflicted:**
- HEAD (post-#39): Declared ~20 state variables — full collection UI state (search, sort, pagination, bulk edit, editing printing, pending CSV file) plus all order state.
- collection-refactor: Declared only `const [collection] = useLocalStorage(...)` as a read-only reference.

**Resolution:** Kept a writable `collection` and `collectionMeta` in `App.tsx` (not read-only) so that `handleMarkReceived` and `handleMarkCancelled` can write merged order cards back to the same localStorage keys that `CollectionPage` reads from. Both use the key `"mtg-checklist-collection-v2"` so writes from `App.tsx` are immediately reflected in `CollectionPage` on next render.

Dropped all collection UI state (search, sort, pagination, etc.) — those are now owned by `CollectionPage`. Kept all order state as-is.

---

### `src/App.tsx` — line 355 (handler functions)

**What conflicted:**
- HEAD (post-#39): ~280 lines of collection handlers (`importCollectionFile`, `handleCollectionUpload`, `handleClearCollection`, `handleCollectionIncrement`, `handleCollectionDecrement`, `handleCollectionRemove`, `handleUpdatePrinting`, `commitPrintingEdit`, `handleBulkEdit`) followed by order handlers.
- collection-refactor: Empty — all collection handlers moved into `CollectionPage`.

**Resolution:** Dropped all collection handlers (they now live in `src/features/collection/`). Kept all order handlers intact (`orderLabel`, `handleCreateOrder`, `handleAddOrderCard`, `handleRemoveOrderCard`, `handleUpdateOrderCardQty`, `handleDeleteOrder`, `handleMarkReceived`, `handleMarkCancelled`, `handleDismissNotification`).

---

### `src/App.css` — line 1103 (collection CSS block)

**What conflicted:**
- HEAD (post-#39): ~200 lines of old inline collection CSS (`.collection-header`, `.collection-meta`, `.collection-empty`, `.collection-upload-btn`, etc.) followed by ~240 lines of order tracking CSS.
- collection-refactor: A single comment: `/* Collection styles live in features/collection/CollectionPage.css */`

**Resolution:** Dropped the old inline collection CSS (it had been moved to `src/features/collection/CollectionPage.css` by PR #47). Kept the order tracking CSS block in full. The comment was already present above the conflict marker and was preserved.

---

## PR #48 — `refactor/decks-page-redesign` → `beta-features`

Five conflict markers across two files. Two were additive (both sides needed), one was imports, two were CSS sections.

---

### `src/App.tsx` — line 11 (imports)

**What conflicted:**
- HEAD (post-#39, #47): Order types, carrier utilities, `CollectionPage`, order helper functions.
- decks-redesign: `CollectionMeta` type (already present in HEAD), `parseCollectionCSV` (dropped — CollectionPage owns this now), `getDeckColorIdentity` / `formatRelativeDate` / `getDeckDomain` from the new `deckUtils` module.

**Resolution:** Kept everything from HEAD and added the three `deckUtils` imports from the decks-redesign branch. Dropped `parseCollectionCSV` from the decks branch since it was already handled by `CollectionPage`.

---

### `src/App.tsx` — line 1105 (JSX inside deck content area)

**What conflicted:**
- HEAD (post-#39): Deck notification banners JSX (rendered when an order is cancelled, showing affected cards with "Show cards" / "Dismiss" actions).
- decks-redesign: Buy CTA banner JSX (the `Buy N ▾` dropdown for Manapool / TCGPlayer / Card Kingdom).

Both blocks render in the same area above the `<Checklist>` component and serve different purposes — one is a contextual alert, the other is a persistent action.

**Resolution:** Kept both blocks. Notification banners render first (they're urgent/dismissable), buy CTA renders second (persistent). No logic overlap between them.

---

### `src/App.css` — lines 1213–1614

**What conflicted:**
- HEAD (post-#39): Continuation of order tracking CSS — picked card list styles, order filter tabs, order list rows, order detail panel, delete confirm styles.
- decks-redesign: All new sidebar and deck page CSS — sidebar search, deck item percentage display, format pill, color dots, delete confirm inline, deck meta line, buy CTA banner, segmented progress strip, filter pills, sort pill, missing-only pill checkbox, and format inline edit input.

Both blocks were entirely additive with no overlapping selectors.

**Resolution:** Kept both blocks in full. Order CSS first (continuation from above), decks CSS appended after.

---

## TypeScript

`npx tsc --noEmit` was run after each of the three merges and returned no errors.
