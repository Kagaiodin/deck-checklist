# Trade IA — Design Brief

Issue: #116. Resolves the open questions there. Related: #109 (binder, ledger, invoice), #44 (surplus view), #119 (QR share), #114/#115 (calculator, shipped), #55 and #87 (buy flow).

## Vision check

Trade features are framed as **cards leaving the collection**, not a place to admire holdings. Nothing here shows total collection value, and Collection gains no trade state.

## Decision summary

| # | Question | Decision |
|---|----------|----------|
| 1 | Where does trade live? | The **Orders tab becomes Transactions**: buys and trades/sales in one top-level area. No new top-level tab. |
| 2 | One area or separate entry points? | One area, sub-tabs: **Buys · Trades & sales · Binder**. Calculator is reached from Binder and the ledger ("New trade"), plus a Collection entry point that deep-links in. |
| 3 | Tradeable flag vs. calculator guardrail | **No flag** (option b). Collection stores no trade state. The Binder is a derived surplus view. |
| 4 | How is the flag-less Binder corrected? | **Exclude list only** (see below). No manual include; the calculator can still add any card by hand. |
| 5 | Ledger and invoices | One **global ledger** (Trades & sales). An invoice opens from a ledger entry. |
| 6 | Calculator to ledger | **"Log this trade"** on the calculator opens a pre-filled ledger form, then writes on confirm. |
| 7 | Cards in | Logging applies **both directions**: `cardsOut` decrement Collection, `cardsIn` merge in. |
| 8 | Mobile | No bottom-bar change (still three top-level tabs). Sub-tabs use the existing segmented/filter pattern from `OrdersPage`. |
| 9 | #44 | Folds into Binder; close #44 when #109's spec is updated. |

## Navigation

```
[Decks] [Collection] [Transactions]
Transactions ▸ [Buys | Trades & sales | Binder]
  Buys             today's OrdersPage, unchanged
  Trades & sales   ledger list, entry detail, invoice
  Binder           derived surplus list; "New trade" opens the Calculator
Collection ▸ menu entry "Trade calculator" deep-links to Transactions ▸ Calculator
```

- `view` in `App.tsx` changes from `"orders"` to `"transactions"`. Persisted keys are unchanged for orders (`mtg-checklist-orders-v1`).
- The Calculator keeps its `/trade` and `/#trade=…` share-link behavior. Opening a share link lands on Transactions with the Calculator open (today it lands on Collection).
- Calculator state stays a scratchpad: it writes nothing until "Log this trade".

## Binder: derived surplus

A card is surplus when owned copies exceed what decks need.

- `surplus = owned quantity − quantity committed to decks`, using the committed-quantity computation Collection already uses (`CommittedInfo`). Show only `surplus > 0`.
- Nothing is stored on Collection items. The Binder re-derives on every render.
- **Exclude list**: a small separate persisted set of card keys the user has hidden from the Binder ("keep these"). It is Binder state, not Collection state, so the calculator guardrails (UAT 1.6, 11.1) still hold.
- No manual include. A card the rule doesn't count can still be added in the Calculator via the collection picker or Scryfall search.
- Binder rows reuse Collection's card row visuals where possible. Actions: Exclude, Add to a new trade.

## Data model

New record, sibling to `Order` (the two do not share a shape: `Order` is inbound shipping with deck links, ETA and tracking; a trade has a counterparty and cards in and out).

```ts
interface TradeLogEntry {
  id: string;
  date: number;
  counterparty?: string;        // free text, no accounts
  cardsOut: TradeLogCard[];
  cardsIn: TradeLogCard[];      // empty for straight sales
  cash: { out: number; in: number };
  priceSnapshot: ...;           // per-card unit price at log time; never re-fetched
  notes?: string;
}
// TradeLogCard reuses TradeCard fields: name, scryfallId, set, collectorNumber,
// finish, condition, quantity, unit price (post condition and discount).
```

- New persisted keys (names TBD in the implementation spec): ledger entries and the Binder exclude list.
- Both keys must be added to `MANAGED_KEYS` in `src/features/demo/demoMode.ts`, so demo mode isolates them from real data and backups.
- `ProfileExport` gains the ledger and exclude list; bump or handle the envelope version deliberately.

## Logging a trade (write path)

"Log this trade" mirrors `handleMarkReceived` in `App.tsx`:

1. Confirm step shows what will change in Collection: cards leaving, cards arriving, cash.
2. On confirm: append the `TradeLogEntry`; decrement Collection for `cardsOut`; merge `cardsIn` (quantity-only unless set and collector number are known); re-apply the collection to decks via `APPLY_COLLECTION`.
3. Cards leaving that are committed to a deck are flagged in the confirm step (as the collection picker does with "N in decks"), not blocked.
4. Ledger entries are not editable after logging in v1. A mistaken entry can be deleted, and Collection changes are not auto-reverted (the delete confirm says so).

Prerequisite refactor: extract the receive/cancel handlers out of `App.tsx` into the store or a hook before adding the log-trade handler, so `App.tsx` does not grow another large handler.

## Invoice

Generated from a ledger entry: counterparty, date, cards out and in with price snapshot, cash, total. Output is an on-screen printable view (print stylesheet) plus copy-as-text, no PDF service. Exact layout goes through Open Design.

## Impacts on existing work

- **#109 / `trade-binder-spec.md`**: remove the `tradeable` flag and the "filtered view where `tradeable === true`" model; replace with derived surplus plus the exclude list; move ledger and invoice under Transactions; update the routing section.
- **#44**: close as folded into Binder.
- **#119 / QR share**: unchanged; the QR still hangs off the Calculator's share row.
- **Calculator UAT**: no change to 1.6 and 11.1. Add UAT for "Log this trade" (only write path) and for the deep link from Collection.
- **#55, #87**: Buys sub-tab is where these land; no IA change.

## Demo mode impact

- Rename of the tab affects demo copy and onboarding copy that mentions "Orders".
- Demo needs sample ledger entries and a managed key for the ledger and exclude list; update `demoData.test.ts`. Demo decks must stay full 100-card Commander lists, and the sample ledger must not make Collection quantities inconsistent with them.

## Open items for the implementation spec

- Exact persisted key names and export-envelope versioning.
- Whether partial stacks need handling in the Binder when only some copies are committed (the derived rule already covers quantity; confirm display wording).
- Condition and foil handling when merging `cardsIn` into a quantity-only Collection.
- Copy and onboarding updates for the Transactions rename.
- Hand-off: Calculator to ledger form data contract (`Trade` to `TradeLogEntry` mapping).

## Design handoff (Open Design)

Project `5c6d105f-c086-441b-ad55-2e3403c89799`. Skill: `redesign-existing-projects` for the nav and Transactions shell (existing UI); `frontend-design` for the ledger entry form, ledger list, and invoice view (new). Mock:

1. Transactions shell: desktop and mobile, sub-tab treatment, reusing `OrdersPage` patterns.
2. Binder: populated, empty, and an excluded-cards state.
3. Ledger list and entry detail.
4. "Log this trade" confirm step, including the in-deck warning.
5. Invoice (screen and print).
6. Collection menu entry that deep-links to the Calculator, kept minimally invasive.

Constraints: tokens from `src/tokens.css` only; light and dark; accessible; no total collection value anywhere.
