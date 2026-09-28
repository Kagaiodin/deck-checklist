# Trade Interface — Tech Spec

Branch: `feat/trade-interface`. Issue: #114.
Related: #109 (Trade Binder: tradeable flag, ledger, invoice), #44, #97 — this feature ships **standalone** and exposes a hook for #109 later (see Ledger hook).
Design brief: `docs/specs/trade-interface-design-brief.md`

## Summary

A video-game-style trading screen: three panels — **My offer** (left), **Control panel** (center), **Their offer** (right). Users build both sides of a hypothetical trade, see prices adjusted by a configurable "TCGplayer − x%" rule, and get a live fairness meter. A trade can be shared as a view-only link.

## Vision check

Per the collection-page rule: the trade screen must stay a calculator for moving cards along, not a value/portfolio tracker, and no feature here may show total collection value. The collection is a *source picker* for the "mine" side when browsing your own cards. Nesting the entry point under Collection (see Nav placement) puts more pressure on this rule than a standalone tab would — flagged for re-confirmation before implementation.

## Decisions (confirmed with user)

| Topic | Decision |
|---|---|
| Relationship to #109 | Sandbox now, ledger hook later. Nothing here writes to Collection or any ledger in v1. |
| Their side | Search + shareable link. No accounts, no real-time sync. |
| Price basis | Scryfall price fields (TCGplayer-derived) minus a configurable discount % |
| Discount scope | Global default + per-side override + per-card override (most specific wins) |
| Card detail | Specific printing, finish (nonfoil / foil / etched), condition modifier, manual price override |
| Share link | Cards + price snapshot + discount settings, opened **view-only**, with "Fork into my own trade" |
| Fairness indicator | Horizontal split meter |
| Fairness threshold | Single configurable tolerance (fair within X%), default 10% |
| Discount default | 10% |
| Condition multipliers | NM 100 / LP 90 / MP 75 / HP 55 / DMG 40, editable later (not v1); does not apply to manual price override |
| Fairness bands | Fair ≤10%, Leaning 10–25%, Lopsided >25% |
| Share link perspective | Flips on open — opener's own cards always render on the left |
| Share link length | Compressed hash URL; if too long, offer "copy as text" instead (no backend/KV in v1) |
| Persistence | In-progress trade + settings persist in localStorage for now; trade templates are a later idea |
| Collection picker | Caps at owned quantity; deck-committed cards are flagged ("N in decks") but not blocked |
| Their-side editing | Condition/finish editable identically to My offer |
| Fairness + cash lines | Cash/credit lines (if built) count toward the fairness meter |
| Nav placement | Nested under Collection for v1 — **flagged tension**: the collection-vision rule says the collection tab should not become a destination in its own right; a Trade entry point inside Collection risks that. Re-confirm this placement specifically (not just the feature) before building nav, or revisit a standalone tab. |

## Scope (v1)

1. New view nested under Collection (per Nav placement decision above) — entry point from `CollectionPage`, route/state TBD at implementation (not a new top-level `view` value), feature folder `src/features/trade/`.
2. Two offer panels with card rows: quantity, printing, finish, condition, price, per-card discount override, manual price override.
3. Add cards to **My offer** from (a) Collection and (b) Scryfall search. Add cards to **Their offer** from Scryfall search only.
4. Price fetch on add; manual refresh from the control panel.
5. Control panel: discount, tolerance, refresh, fairness meter, totals, swap/clear, share.
6. Shareable view-only link with fork.
7. Unit + component tests per CLAUDE.md test requirements.

### Out of scope (v1)
- Writing to Collection, decks, orders, or any ledger (see Ledger hook).
- Real-time two-user sessions, accounts, server-side storage.
- Adding Their cards from a pasted list/CSV (not selected; could be a follow-up).
- Any display of total collection value.

## Screen layout

```
┌───────────────────────┬──────────────────────┬───────────────────────┐
│ MY OFFER              │ CONTROLS             │ THEIR OFFER           │
│ [+ From collection]   │ Fairness meter       │ [+ Search cards]      │
│ [+ Search cards]      │ Totals (both sides)  │                       │
│ card rows...          │ Discount / Tolerance │ card rows...          │
│ side subtotal         │ Refresh prices       │ side subtotal         │
│                       │ Swap / Clear / Share │                       │
└───────────────────────┴──────────────────────┴───────────────────────┘
```
Mobile: layout left to Open Design to propose and recommend (stacked / tabbed / swipe).

## Data model

New types in `src/types/trade.ts`.

```ts
type Finish = "nonfoil" | "foil" | "etched";
type Condition = "NM" | "LP" | "MP" | "HP" | "DMG";

interface TradeCard {
  id: string;                    // local uuid, stable row key
  name: string;
  scryfallId: string;            // resolved printing
  set: string;
  collectorNumber: string;
  finish: Finish;
  condition: Condition;          // default NM
  quantity: number;              // >= 1
  imageUrl?: string;             // small image for row; not in share payload
  basePrice: number | null;      // fetched, USD, for chosen printing+finish; null = unavailable
  priceFetchedAt: number | null; // epoch ms
  manualPrice?: number;          // if set, replaces basePrice*conditionMultiplier entirely — discount still applies; see Pricing rules
  discountOverridePct?: number;  // per-card override
  source: "collection" | "search";
}

interface TradeSide {
  cards: TradeCard[];
  discountOverridePct?: number;  // per-side override
}

interface TradeSettings {
  discountPct: number;           // global default, 10
  tolerancePct: number;          // "fair within X%", default 10
}

// Default condition multiplier table (editable in a later version, not v1)
const CONDITION_MULTIPLIERS: Record<Condition, number> = {
  NM: 1.0, LP: 0.9, MP: 0.75, HP: 0.55, DMG: 0.4,
};

interface Trade {
  mine: TradeSide;
  theirs: TradeSide;
  settings: TradeSettings;
  readOnly: boolean;             // true when opened from a share link
}
```

Trade state (`mine`, `theirs`, `settings`) persists to `localStorage` so an in-progress trade survives a reload; a trade opened `readOnly` from a share link is not persisted (fork it to persist). Trade templates (save/reload a named trade setup) may come later — not v1.

## Pricing rules

Pure functions in `src/utils/tradePricing.ts` (fully unit-tested).

1. **Base price** — from Scryfall `prices`: `usd` (nonfoil), `usd_foil` (foil), `usd_etched` (etched), chosen by the card's `finish`. If the field is null → `basePrice = null`, row flagged "No price"; row contributes $0 until the user sets a manual price.
2. **Condition multiplier** — from `CONDITION_MULTIPLIERS`, applied to `basePrice` only. **Does not apply when `manualPrice` is set** — a manual price is taken as the final, already-condition-adjusted price.
3. **Effective base** — `manualPrice ?? (basePrice × conditionMultiplier)`.
4. **Discount resolution** — `card.discountOverridePct ?? side.discountOverridePct ?? settings.discountPct` (default 10%).
5. **Unit price** — `effectiveBase × (1 − discount/100)`.
6. **Line total** — `unitPrice × quantity`.
7. **Side total** — sum of line totals. Cards with null price contribute 0 and are counted in a `missingPriceCount` surfaced in the UI.
8. Round to cents only at display, never mid-calculation.

## Fairness

`fairness(mineTotal, theirTotal, tolerancePct)` returns:
```ts
{ delta: number;          // mineTotal - theirTotal (USD); positive = I'm giving more
  deltaPct: number;       // |delta| / max(mineTotal, theirTotal) * 100; 0 if both 0
  favors: "me" | "them" | "even";
  band: "fair" | "leaning" | "lopsided";
  balanceHint: number }   // dollars the lower side must add to be even
```
- `band`: `fair` if `deltaPct <= tolerancePct` (default tolerance 10%); `leaning` if `10% < deltaPct <= 25%`; `lopsided` if `deltaPct > 25%`. The leaning/lopsided cutoffs are fixed constants in v1, not tied to `tolerancePct` scaling — revisit if user feedback wants them to scale together.
- Empty state: if either side is empty, meter shows a neutral "add cards to compare" state, not "fair".
- "Favors" wording: the side receiving *more value than it gives* is favored. Copy TBD in design brief.
- If cash/credit lines (suggestion #2) are built, their $ amounts are added into each side's total before the fairness calculation.

## Card sources

- **Collection picker (My side only)** — read-only over `Collection` (`Record<lowercased name, CollectionPrinting[]>`, see `src/types/index.ts`). Selecting a printing pre-fills set / collector number / foil and caps quantity at owned quantity. Picking does **not** decrement collection. Cards already committed to a deck show an "N in decks" flag on the row but remain selectable (not blocked).
- **Scryfall search (both sides)** — new util `src/utils/scryfallSearch.ts` using `https://api.scryfall.com/cards/search` (autocomplete via `/cards/autocomplete`), with printing lookup via search `unique=prints`. Follow the fetch pattern in `src/utils/validator.ts`. Respect Scryfall's rate guidance (50–100 ms between requests, debounce input ≥ 250 ms) and send no auth (free tier constraint). Workers-safe: browser `fetch` only.

## Price refresh

- Prices are fetched when a card is added and when printing/finish changes.
- Control panel **Refresh prices** re-fetches every card on both sides in one batch using `POST /cards/collection` by `scryfallId` (75 per batch, same as `SCRYFALL_BATCH_SIZE` in `validator.ts`). Shows progress/disabled state, and a per-card "updated hh:mm" tooltip. Failures leave the prior `basePrice` and mark the row stale.
- Refresh is disabled in `readOnly` mode (shows the snapshot as shared).

## Share link

- Client-only, **URL hash** (`/#trade=<payload>`), so nothing hits the server and Workers SPA fallback is unaffected.
- Payload (JSON → deflate via `CompressionStream` → base64url), versioned (`v: 1`). Per card: name, set, collectorNumber, finish, condition, quantity, `basePrice` snapshot, manualPrice, override pcts; plus both side overrides and `TradeSettings`. **No** images or ids beyond set+cn.
- Opening a link renders the trade `readOnly` with a banner: "Shared trade — prices as of <snapshotTime>" and a **Fork into my own trade** button (clones to an editable local trade, prices remain the snapshot until Refresh).
- Perspective on open: panels **flip** so the opener's own cards are always on the left. Payload stores two symmetric sides (`sideA`, `sideB`) with no baked-in "mine"/"theirs" label — the creator's `mine` is encoded as `sideA`. On open: `sideA` renders on the right ("their offer", from the opener's point of view) and `sideB` renders on the left ("my offer"). In other words, the opener's left panel shows what the *creator* had labeled "their offer."
- No built-in link shortener in v1 (would need Workers KV — new infra). If the compressed payload is too long for a practical URL, the share action falls back to **"Copy as text"** (a plain-text trade summary) instead of a link. Exact length threshold TBD at implementation (test against real browser/OS URL limits, aim to warn well before ~8000 chars).
- Malformed / unknown-version payloads → friendly error state, never a crash.

## Ledger hook (for #109, not built in v1)

Keep `Trade` serializable and free of UI state so a future "Log this trade" action can map `mine.cards → cardsOut[]`, `theirs.cards → cardsIn[]`, and the `basePrice`/discount values → `priceContext`. No code in v1 imports or depends on #109 types.

## Control-panel features (v1 decisions)

Core (confirmed from the start): refresh prices button, fairness indicator, global discount %, tolerance %.

Additional features, decided:

| # | Feature | v1? | Notes |
|---|---|---|---|
| 1 | Balance suggestion — "Add $X to My side to even out" | **Yes** | Uses `balanceHint`. |
| 2 | Cash / credit line — manual +$ on either side | **Yes** | Counts toward fairness totals (see Fairness). |
| 3 | Swap sides | **Yes** | |
| 4 | Clear trade with undo toast | **Yes** | |
| 5 | Price freshness indicator ("Updated 3 min ago" + stale warning) | **Yes** | |
| 6 | Missing-price warning with jump-to-row | **Yes** | |
| 7 | Copy as text (plain-text summary for Discord/chat) | **Yes** | Also doubles as the share-link fallback (see Share link). |
| 8 | Lock/confirm "Lock offer" animation (cosmetic, no functional effect) | **No** | Cut from v1; revisit later for polish. |
| 9 | Bulk condition apply (set condition for a whole side at once) | **Yes** | |
| 10 | Undo/redo for recent edits | **Yes** | |

## Files to add

- `src/features/trade/TradePage.tsx`, `TradePage.css` (styles scoped in the feature file; do not grow `App.css`)
- `src/features/trade/components/` — `OfferPanel`, `TradeCardRow`, `ControlPanel`, `FairnessMeter`, `CardSearchSheet`, `CollectionPickerSheet`, `ShareBanner`
- `src/features/trade/hooks/useTrade.ts` (state via reducer, local to the feature; not in DeckProvider since it is sandbox state)
- `src/types/trade.ts`
- `src/utils/tradePricing.ts`, `src/utils/tradeShare.ts`, `src/utils/scryfallSearch.ts`
- Entry point lives in Collection (per Nav placement decision) — likely a button/tab inside `CollectionPage.tsx` rather than a new `App.tsx` top-level `view`; exact wiring TBD at implementation once the flagged nav tension is re-confirmed.

## Tests (required by CLAUDE.md)

- `src/utils/__tests__/tradePricing.test.ts` — finish selection, null prices, discount precedence (card > side > global), condition multiplier, manual price, rounding, empty sides.
- `src/utils/__tests__/tradeShare.test.ts` — encode/decode round trip, version mismatch, malformed input, size limit.
- `src/utils/__tests__/scryfallSearch.test.ts` — mocked fetch, debounce-independent parsing, error paths.
- `src/features/trade/__tests__/` — `TradePage` (add from search/collection, edit qty/finish/discount, refresh, meter states incl. empty, read-only mode + fork), `FairnessMeter`, `useTrade`.
- `npm run test:coverage` and `npm run build` must pass before any push.

## Remaining open item

- **Nav placement inside Collection** — see the flagged tension in Decisions. Needs a specific yes before implementing nav, distinct from the rest of this spec being resolved.
- Exact share-URL length threshold to trigger the "copy as text" fallback (implementation detail, test against real limits).
- Mobile layout is intentionally left to Open Design to propose (stacked / tabbed / swipe) and recommend — not a blocker, resolved during design.

## Routing

New page + unknown visual direction → per CLAUDE.md, Open Design first, then implement from the local artifact. Read local artifact files only; never via MCP.
