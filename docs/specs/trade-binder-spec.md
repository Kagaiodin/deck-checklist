# Trade Binder — Tech Spec

Tracks issue #TBD (Trade Binder). Related: #44 (trade/surplus list view), #97 (generate trade/sale invoice) — left open, not superseded; this feature absorbs their scope but the older issues stay as historical context/reference.

## Vision check

Per the collection-page vision rule: the trade binder is not a value/portfolio tracker. It exists to help the user move cards along (trade or sell them away), not to admire holdings. Framing: "cards leaving the collection," not "cards I own."

## Scope (v1)

1. **Tradeable display** — a new page listing cards flagged as tradeable/surplus.
2. **Trade ledger** — a log of completed trades (full detail, not lightweight).
3. **Invoice generation** — produce a shareable trade/sale invoice from binder contents.

## Data model

### Tradeable flag (extends Collection)
- Existing collection items gain a `tradeable: boolean` (or `tradeableQuantity` if partial-stack trading is needed — TBD during implementation, default to boolean for v1 unless partial trades come up as a real need).
- Trade binder page is a filtered view over Collection where `tradeable === true` — no separate/duplicated card list.

### Trade ledger entry
Full ledger per the user's decision (not lightweight mark-as-traded):
- `id`
- `date`
- `counterparty` (free text — name/handle, no accounts)
- `cardsOut[]` — cards/quantities that left (pulled from binder-flagged items; decrements collection quantity and clears the tradeable flag on completion)
- `cardsIn[]` — cards/quantities received in return (optional — some trades are one-directional, e.g. straight sales)
- `priceContext` — snapshot of per-card price at time of trade (see Pricing below), stored so historical ledger entries don't drift if prices change later
- `notes` (free text, optional)

### Pricing
- Reuse the existing Scryfall integration pattern already in `src/utils/validator.ts` (`SCRYFALL_COLLECTION_URL` / `SCRYFALL_NAMED_URL`) — Scryfall's card objects include a `prices` field (`usd`, `usd_foil`, `eur`, `tix`).
- Pull price at the point a card is flagged tradeable and/or at trade completion; store the snapshot on the ledger entry rather than looking it up live each time the ledger is viewed (prices fluctuate — historical entries should reflect what was true at the time).
- No pricing API keys/paid tiers — Scryfall's public API is free, consistent with the free-tier infra constraint.

### Invoice generation
- Generated from a completed (or in-progress) ledger entry: counterparty, cards out/in, per-card price snapshot, total.
- Output format TBD in design brief — likely a printable/shareable view (HTML print stylesheet or exportable text/markdown), not a PDF service (avoids paid infra).

## Open questions for design brief
- Exact invoice output format (on-screen printable view vs. copyable text vs. downloadable file)
- Whether `cardsOut`/`cardsIn` need per-card condition/foil notes for pricing accuracy
- Where the "flag as tradeable" action lives in the existing Collection UI (row action? bulk action?)
- Whether partial-stack tradeable flagging (e.g. "3 of my 4 copies") is needed for v1 or can wait

## Routing
New page + unknown visual direction → per CLAUDE.md, route through Open Design first for the binder page layout, ledger entry form, and invoice view before implementation.
