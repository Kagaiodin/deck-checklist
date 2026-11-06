# Transactions, Binder and Trade Ledger — Implementation Spec

**Feature:** Orders tab becomes Transactions (Buys · Trades & sales · Binder); derived Binder; trade ledger; "Log this trade"; invoice
**Status:** Ready for implementation (decisions D1–D5 resolved, §10)
**Issues:** #109 (umbrella), #116 (IA decision), #44 (folds into Binder, close with the Binder PR), #119 (QR share, unchanged)
**Decisions:** `docs/specs/trade-ia-design-brief.md` (the brief wins on any conflict). Product scope: `docs/specs/trade-binder-spec.md`. This spec resolves their open implementation items.
**Design source:** Open Design project `5c6d105f-c086-441b-ad55-2e3403c89799`, approved 2026-11-04:
`transactions-shell-*` (shell, Binder desktop/mobile, Collection entry; shared `transactions-shell.css`) and
`transactions-ledger-*` (list, detail, log-confirm, invoice; `transactions-ledger.css`). Build with the `implement-from-open-design` skill.

**Vision check:** cards leaving the collection. No total collection value anywhere. Collection gains no trade state.

---

## 1. Navigation and routing (`src/App.tsx`)

- `view` becomes `"decks" | "collection" | "transactions"`. Nav label "Transactions". Persisted key `mtg-checklist-orders-v1` is unchanged.
- New `src/features/transactions/TransactionsPage.tsx` owns the sub-tab state (`"buys" | "trades" | "binder"`) and renders the existing `OrdersPage` for Buys with its props passed through unchanged. Sub-tabs reuse `.order-filter-tabs`, including its `.count` badge: Buys shows the order count, Trades & sales the ledger entry count, Binder the Binder row count (hidden at ≤480px so "Trades & sales" fits). The Binder sub-tab header also says "N card(s)".
- The Calculator (`TradePage`) moves out from under Collection. `tradeOpen` stays in `App.tsx` but renders inside the Transactions view, replacing the sub-tab body, and `switchView` still closes it.
- `openedWithTradeLink()` (`/trade`, `/#trade=…`) now sets `view` to `"transactions"`. The `hashchange` listener does the same. Share-link behavior, `clearTradeHash` and the `/trade` path handling are otherwise unchanged.
- Collection's "Trade calculator" menu entry keeps its `onOpenTrade` prop; the handler switches to Transactions and opens the Calculator. No Collection UI change.
- Calculator entry points record an `origin: "collection" | "binder" | "trades" | "link"`. `TradePage` takes it and labels its back control accordingly (decision D1). `onBack` returns to the origin: Collection, or the Transactions sub-tab. A share link has origin `"link"` and returns to Binder.
- `onViewOrder: () => switchView("orders")` becomes `switchView("transactions")` with the sub-tab set to Buys.
- Copy: grep for "Orders" in nav, onboarding, demo and `ImportBackupModal` ("wipe all existing decks, collection, and orders") and update where it names the tab. Order-specific copy inside Buys stays.

## 2. Prerequisite refactor (PR 1)

Extract `handleMarkReceived` and `handleMarkCancelled` (`App.tsx:449`, `:477`) into `src/hooks/useOrderActions.ts`, taking `{ orders, setOrders, collection, setCollection, setCollectionMeta, dispatch }`. Behavior-preserving; add `__tests__/useOrderActions.test.tsx` covering received (status, `BULK_SET_SOURCE`, collection merge, meta) and cancelled (status, `UNSET_CARD_SOURCES`, re-apply, notifications). The log-trade handler (§5) is then built beside it in `useTradeLedger`, not in `App.tsx`.

## 3. Binder (derived)

### Derivation — `src/features/transactions/binder/binderSurplus.ts`
```ts
interface BinderRow {
  key: string;            // lowercased card name, the Collection key
  name: string;           // display name (first printing's casing if known, else key)
  owned: number;          // sum of printing quantities
  committed: number;      // CommittedInfo.total for this name
  surplus: number;        // owned - committed, > 0
  printings: CollectionPrinting[];
}
deriveBinder(collection, getCommittedInfo, excluded: ReadonlySet<string>): { rows: BinderRow[]; excludedRows: BinderRow[] }
```
- Surplus is per card name, because deck cards carry no set, collector number or finish (same basis as `ownedFor` and `useCommittedInfo`). Printings are shown on row expansion only: on desktop a row with 2+ printings gets a "▸ N printings" toggle that lists each printing ("CMM #1 · Foil", or "No set recorded") with its quantity under the row; on phones the row sheet lists them. Single-printing rows rely on the subtitle.
- `rows` = surplus > 0 and not excluded; `excludedRows` = surplus > 0 and excluded (the "Keep these" list). A card whose surplus drops to 0 while excluded disappears from both and stays in the persisted set (harmless; it reappears if surplus returns).
- Sorted by name ascending. Pure function; memoised in `useBinder(collection, decks)`.
- Partial stacks: wording is `"{owned} owned · {committed} in decks · {surplus} spare"` (resolves the brief's open item).
- No prices, no totals, no value.

### Exclude list
- Persisted `string[]` of lowercase names at `mtg-checklist-binder-excluded-v1`, held in a small shared store (`useSyncExternalStore` over localStorage plus a change event, so Binder and an import stay in step), exposed as `useBinderExcludedList()` and `useBinderExcluded()` (`exclude(key)`, `restore(key)`).
- Exclude shows the same Undo toast Collection uses. Restore is "Show in Binder".
- "Add to new trade" opens the Calculator with that card pre-added to "mine" (see §6); it does not change the exclude list.

### UI
Per mockups `transactions-shell-binder-*`: populated, "no spare cards" empty, "everything kept out" empty, "Keep these" disclosure, mobile row-actions sheet reusing the card-row bottom sheet. Empty-collection Binder state is not mocked; use the shared `EmptyState` pattern with copy "Import a collection to see spare cards" (D5).

## 4. Data model (`src/types/index.ts`, `src/types/trade.ts`)

```ts
interface TradeLogCard {
  name: string;
  scryfallId: string;
  set: string;
  collectorNumber: string;
  finish: Finish;
  condition: Condition;
  quantity: number;
  unitPrice: number | null;   // snapshot: after condition multiplier and discount; null = no price at log time
}

interface TradeLogEntry {
  id: string;                 // crypto.randomUUID()
  date: number;               // epoch ms, user-editable in the confirm form, default now
  counterparty?: string;
  cardsOut: TradeLogCard[];   // Trade.mine.cards
  cardsIn: TradeLogCard[];    // Trade.theirs.cards, empty for straight sales
  cash: { out: number; in: number };   // sum of mine.cash / theirs.cash lines
  totals: { out: number; in: number }; // sideTotals(...).total at log time, cash included
  notes?: string;
}
```
- This replaces the brief's `priceSnapshot` placeholder: the snapshot is `unitPrice` per card plus stored `totals`, so the invoice and ledger list never recompute from pricing code that may change.
- `imageUrl`, `basePrice`, manual price and discount overrides are not stored; they are already folded into `unitPrice`.
- Mapping lives in `src/utils/tradeLedger.ts`: `tradeToLogEntry(trade, meta: { date, counterparty?, notes? }): TradeLogEntry`, built from `unitPrice` and `sideTotals` in `tradePricing.ts`. No second pricing path.
- `Trade.mine` is cardsOut ("I give"), `theirs` is cardsIn ("I get"), matching `tradeToText`.

### Persistence
- `mtg-checklist-trade-ledger-v1`: `TradeLogEntry[]`, newest first, via `useLocalStorage` inside `useTradeLedger()` (`entries`, `logTrade`, `deleteEntry`).
- `mtg-checklist-binder-excluded-v1`: see §3.
- Both go in `MANAGED_KEYS` (`demoMode.ts:8`). The ledger also goes in `DATA_KEYS` (`demoMode.ts:79`) so a replace confirm counts it as user data. The exclude list does not.

## 5. Logging a trade (the only Collection write path)

`logTrade(trade, meta)` in `useTradeLedger`, given `{ collection, setCollection, setCollectionMeta, dispatch }`:

1. Build the entry (`tradeToLogEntry`).
2. `applyTradeToCollection(collection, cardsOut, cardsIn)` — pure, in `src/utils/tradeLedger.ts`, returns `{ collection, shortfall: TradeLogCard[] }`.
3. In one handler, in this order: prepend the entry, `setCollection(next)`, update `collectionMeta.cardCount` (same shape as `handleMarkReceived`), `dispatch({ type: "APPLY_COLLECTION", payload: next })`.
4. Clear the local trade (`fetchlist-trade`) after success so a logged trade is not logged twice; the Calculator resets to empty and a toast links to the new ledger entry.

### `applyTradeToCollection`
- **Out:** for each card, take from the matching printing (same set, collector number and foil-ness, where foil = finish ≠ nonfoil, as in `ownedFor`). If the exact printing has too few, take the remainder from a generic printing (no set/collector number), then from any other printing of that name, largest first. Remove printings that reach 0 and the key when no printings remain. Anything still unmet is returned in `shortfall` (never negative quantities).
- **In:** trade cards always carry set and collector number, so merge as a full printing: increment the matching printing, else push `{ quantity, set, collectorNumber, foil }`. This is richer than the quantity-only order-receipt merge and resolves the brief's open item.
- **Condition:** Collection stores none, so condition is dropped on merge and kept only in the ledger entry.
- Name keys are lowercased as elsewhere. Dual-faced names follow whatever `collectionEntries` already does; add a test with a double-faced card.
- Pure and unit-tested; `logTrade` is a thin wrapper.

### Confirm step (`LogTradeSheet`)
Opened by "Log this trade" in the Calculator (`TradeWorkspace`). Fields: counterparty (free text), date (default today), notes. Summary: cards leaving, cards arriving, cash in and out, per `transactions-ledger-*`. Each side's heading shows that side's total ("Leaving your collection · $X", "Arriving in your collection · $Y"), from `sideTotals` (the Calculator's figures, cash included), so the value can be checked right before the write.
- **In-deck warning** (not a block): a card leaving is flagged "N in decks" when `ownedTotal − qtyOut < committed`, using `useCommittedInfo` (the same basis as Binder's "N in decks"). The flag shows the copies decks lose, `committed − max(ownedTotal − qtyOut, 0)`, so it still appears when some copies are owned but fewer than are leaving. The note counts distinct cards, not lines. Copy states the deck checklist will show the card as needed again.
- **Not-in-collection note** (not a block): a card leaving with less owned than quantity (typically added from Scryfall search) is flagged "Not in your collection"; Collection simply isn't reduced for the missing copies.
- The backdrop does not dismiss this sheet, so typed counterparty and notes are not lost to a stray click; Cancel, Escape and the close button still do.
- Disabled when both sides are empty. Hidden when `trade.readOnly` (an opened share link) until the user forks it.
- Works in demo mode; the demo keys are isolated by `MANAGED_KEYS`.

### Deleting an entry
Confirm copy: Collection will not change back; cards given stay out, cards received stay in; fix quantities in Collection. No edit in v1.

## 6. Calculator hand-off

- "Add to new trade" from a Binder row calls `openTrade({ origin: "binder", seed: BinderRow })`. The seed is converted to a `TradeCard` on "mine" with the row's printing (largest-quantity printing that has a set and collector number, so a larger generic stack from order receipts never hides the copy the user owns; foil-ness from it), quantity 1, `source: "collection"`. `seedToTradeCard` prices it with the same primitives as Refresh (`fetchPrices` for the printing, `basePriceFor` for the finish) rather than dispatching `applyPrices`, which reprices the whole trade and needs a set and collector number. A row with no such printing (order receipts record quantity only) falls back to the newest printing of that exact name via `searchPrintings`. Collection rows only record foil yes/no, so a foil row on a printing sold only as etched is priced as etched. Unreachable Scryfall leaves the card unpriced.
- "New trade" in Binder and ledger opens an empty Calculator. An unfinished local trade is kept (existing `fetchlist-trade` behavior); seeding adds to it.
- QR share row (#119) is untouched.

## 7. Ledger and invoice UI

- `src/features/transactions/ledger/`: `LedgerPanel` (list and read-only detail in one component), `LogTradeSheet`, `Invoice` (PR 5), each with CSS from the approved mockups (tokens only).
- List: date, counterparty, out/in counts, cash, and each side's snapshot value ("Gave $X", "Got $Y" from `totals.out`/`totals.in`, shown only for a side that has cards or cash; same figures as D3). Empty state with "New trade". Detail is read-only with a footnote "To correct a mistake, delete and re-log".
- Invoice: opened from an entry, in-app state only (no URL). On-screen printable view; `@media print` hides app chrome and shows the paper in light colors regardless of theme; "Print" calls `window.print()`; "Copy as text" uses `ledgerEntryToText(entry)` in `src/utils/tradeLedger.ts`, modeled on `tradeToText`. No PDF service.
- Missing-price cards (`unitPrice: null`) show "no price" and are excluded from totals, as in the Calculator.

## 8. Export, import and Drive backup

- `ProfileExport` gains optional `tradeLedger?: TradeLogEntry[]` and `binderExcluded?: string[]`. **The envelope stays `version: 1`** (decision D2): old backups import unchanged via `?? []`, and a new backup imported by an old build only loses the two new fields rather than triggering "Newer backup format". Bump only on a breaking shape change.
- `ProfileExportImport.tsx` and `GoogleDriveBackup.buildPayload()` include both fields. Props thread through as `orders` does.
- `handleProfileImport`: replace mode sets both; merge mode skips ledger entries whose `id` exists and unions the exclude list.
- `onImport` result gains `newTrades`; `ImportBackupModal` toast adds "N trade(s)" and the replace/wipe copy mentions trades. Shape validation (`"decks" in raw || …`) is unchanged.

## 9. Demo mode

- `demoData.ts`: add 2–3 sample ledger entries (one trade with cards in and out, one straight sale) under `mtg-checklist-trade-ledger-v1`, and an empty `mtg-checklist-binder-excluded-v1`. Demo decks stay full 100-card singleton Commander lists.
- Consistency rules (asserted in `demoData.test.ts`): every `cardsIn` card exists in the demo collection with at least that quantity; no `cardsOut` card is committed to a demo deck; the demo Binder has at least one row so the sub-tab is not empty; each entry's `totals` equals the recomputed sum of `unitPrice × quantity` plus cash.
- Update demo and onboarding copy that says "Orders". Say in the PR that demo was considered and what changed.

## 10. Decisions (resolved 2026-11-04)

| # | Question | Decision |
|---|----------|----------|
| D1 | Calculator back label | Follows the entry point (as mocked); share links default to Binder. |
| D2 | Export envelope | Optional fields on v1; no version bump (§8). |
| D3 | Invoice subtotals | Keep "given vs received" plus cash; they are the entry's own snapshot figures, not collection value. |
| D4 | Mobile control heights | 44px for the new Transactions sub-tabs and top-bar button on mobile only; other `.order-filter-tabs` uses are unchanged. |
| D5 | Empty-collection Binder and 360px header | No new mockup. Use the shared `EmptyState`; drop the nav badge below 380px; at ≤400px tighten the header (12px gutters, logo max 92px, 6px nav-button padding) so the ⋯ button stays on screen at 360px with the longer "Transactions" label; verify both in a browser during PR 2 and PR 3. |

## 11. Tests (vitest, `__tests__/` next to the code)

- `utils/__tests__/tradeLedger.test.ts`: `tradeToLogEntry` mapping and totals; `applyTradeToCollection` (exact printing, fallback order, shortfall, zeroing and key removal, foil match, merge in as full printing, double-faced name); `ledgerEntryToText`.
- `transactions/binder/__tests__/binderSurplus.test.ts` and `useBinder`: surplus math, committed decks, excluded and restored, surplus-to-zero while excluded, partial-stack wording.
- `transactions/__tests__/TransactionsPage.test.tsx`: sub-tabs, Buys passthrough, share-link lands on Transactions with Calculator open, back returns to origin.
- `transactions/ledger/__tests__/`: `LogTradeSheet` (in-deck warning, not-in-collection note, disabled when empty, hidden read-only, writes only on confirm), delete confirm copy, invoice copy-as-text.
- `hooks/__tests__/useOrderActions.test.tsx` (§2).
- Profile export/import: new fields round-trip, old backup without them, merge dedupe by id.
- `demo/__tests__/demoData.test.ts`: §9 assertions.
- Calculator guardrails (UAT 1.6, 11.1) still pass; add UAT cases to `trade-interface-uat-plan.md` for "Log this trade" (the only write path) and the Collection deep link.
- a11y: `npm run test:a11y` covers the new dialogs and sheets. Coverage floors in `vitest.config` must hold; `npm run verify` before each push.

## 12. Delivery plan

One branch (`feat/transactions-trade-ledger`) carries the docs; implementation can land as stacked PRs, one logical change each:

1. `refactor: extract order actions into useOrderActions` (§2).
2. `feat: Transactions shell` — rename, sub-tabs, Calculator moved under Transactions, routing, copy (§1).
3. `feat: Binder` — derivation, exclude list, UI, demo Binder row; closes #44.
4. `feat: trade ledger and Log this trade` — model, persistence, write path, confirm step, list and detail, export/import, demo entries (§4–§9).
5. `feat: ledger invoice` — invoice view, print stylesheet, copy-as-text.

PR 4 is the risky one (Collection writes); keep `applyTradeToCollection` pure and fully tested before wiring it.

## 13. Out of scope (v1)

Editing or reverting ledger entries; per-card notes beyond the snapshot; PDF invoices; counterparty accounts or history; any collection value or portfolio total; manual Binder include; server-side storage.
