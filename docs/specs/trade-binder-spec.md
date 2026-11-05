# Trade Binder — Tech Spec

Issue: #109. Related: #44 (surplus list view, folded in), #97 (invoice, folded in), #116 (IA decision), #119 (QR share). IA and navigation decisions live in `docs/specs/trade-ia-design-brief.md`; where this spec and the brief disagree, the brief wins.

## Vision check

Per the collection-page vision rule: the trade binder is not a value/portfolio tracker. It exists to help the user move cards along (trade or sell them away), not to admire holdings. Framing: "cards leaving the collection," not "cards I own."

## Scope (v1)

1. **Binder** — a derived list of surplus cards (owned copies beyond what decks need). Absorbs #44.
2. **Trade ledger** — a global log of completed trades and sales (full detail, not lightweight).
3. **Invoice generation** — a shareable invoice opened from a ledger entry.

All three live under the **Transactions** tab (the renamed Orders tab) as sub-tabs: Buys, Trades & sales, Binder. The Calculator is reached from the Binder and ledger ("New trade") and from a Collection menu entry that deep-links in.

## Data model

### No tradeable flag
Collection items gain **no** trade state. The earlier `tradeable` flag was dropped (#116, option b) so the calculator guardrail holds: the calculator, Binder and Collection list never carry per-card trade flags, and Collection quantities change only when a trade is logged.

### Binder (derived)
- `surplus = owned quantity − quantity committed to decks`, using the committed-quantity computation Collection already uses (`CommittedInfo`). Show only cards with `surplus > 0`.
- Re-derived on render; nothing about surplus is persisted.
- **Exclude list**: a small separate persisted set of card keys the user has hidden from the Binder ("keep these"). This is Binder state, not Collection state. No manual include; any card can still be added by hand in the Calculator.

### Trade ledger entry (`TradeLogEntry`)
A new record, sibling to `Order` (the shapes differ: `Order` is inbound shipping with deck links, ETA and tracking).
- `id`
- `date`
- `counterparty` (free text, optional — name/handle, no accounts)
- `cardsOut[]` — cards and quantities that left (reuses `TradeCard` fields: name, scryfallId, set, collectorNumber, finish, condition, quantity)
- `cardsIn[]` — cards and quantities received (empty for straight sales)
- `cash` — `{ out, in }` totals from the calculator's cash lines
- `priceSnapshot` — per-card unit price at log time (post condition and discount), stored so historical entries never drift
- `notes` (free text, optional)

Persisted under new localStorage keys (names set in the implementation PR) for the ledger and the Binder exclude list. Both must be added to `MANAGED_KEYS` in `src/features/demo/demoMode.ts`.

### Logging a trade (the only Collection write path)
"Log this trade" on the Calculator opens a pre-filled ledger form with a confirm step:
1. Confirm shows what will change: cards leaving, cards arriving, cash.
2. On confirm: append the entry; decrement Collection for `cardsOut`; merge `cardsIn` (quantity-only unless set and collector number are known); re-apply the collection to decks (`APPLY_COLLECTION`).
3. Cards leaving that are committed to a deck are flagged in the confirm step, not blocked.
4. Entries are not editable after logging in v1. Deleting one does not auto-revert Collection; the delete confirm says so.

Prerequisite: extract the receive/cancel handlers from `App.tsx` into the store or a hook before adding the log-trade handler.

### Pricing
- Reuse the Calculator's pricing engine (Scryfall prices via the existing integration; no paid tiers, consistent with the free-tier constraint). Do not build a second pricing path.
- Prices are snapshotted on the ledger entry, not looked up live when the ledger is viewed.

### Invoice generation
- Generated from a ledger entry: counterparty, date, cards out/in, per-card price snapshot, cash, total.
- Output: on-screen printable view (print stylesheet) plus copy-as-text. No PDF service (avoids paid infra). Exact layout comes from Open Design.

## Profile export and demo
- `ProfileExport` gains the ledger and exclude list; handle the envelope version deliberately.
- Demo mode: managed keys for the ledger and exclude list, sample ledger entries that keep Collection quantities consistent with the 100-card demo decks, update `demoData.test.ts`, and update any copy that says "Orders".

## Open questions (implementation)
- Exact persisted key names and export-envelope versioning.
- Display wording for partially committed stacks in the Binder.
- Condition and foil handling when merging `cardsIn` into a quantity-only Collection.
- Whether the ledger needs per-card notes (condition or foil) beyond the snapshot.

## Routing
UI direction goes through Open Design per `trade-ia-design-brief.md` (Transactions shell, Binder, ledger, confirm step, invoice, Collection entry point) before implementation.
