import type { Collection, CollectionPrinting } from "../types/index";
import type { Finish, Trade, TradeCard, TradeLogCard, TradeLogEntry, TradeSide } from "../types/trade";
import { sideTotals, unitPrice } from "./tradePricing";

export interface LogMeta {
  date: number;
  counterparty?: string;
  notes?: string;
}

const isFoilFinish = (f: Finish) => f !== "nonfoil";

/** Collection keys are lowercased front-face names; trade cards may carry the full "A // B" name. */
export function collectionKey(name: string): string {
  const front = name.includes(" // ") ? name.split(" // ")[0] : name;
  return front.trim().toLowerCase();
}

function toLogCard(card: TradeCard, side: TradeSide, settings: Trade["settings"]): TradeLogCard {
  return {
    name: card.name,
    scryfallId: card.scryfallId,
    set: card.set,
    collectorNumber: card.collectorNumber,
    finish: card.finish,
    condition: card.condition,
    quantity: card.quantity,
    unitPrice: unitPrice(card, side, settings),
  };
}

/** Snapshots a trade for the ledger. Prices come from the one pricing path in tradePricing. */
export function tradeToLogEntry(trade: Trade, meta: LogMeta): TradeLogEntry {
  const { mine, theirs, settings } = trade;
  const counterparty = meta.counterparty?.trim();
  const notes = meta.notes?.trim();
  return {
    id: crypto.randomUUID(),
    date: meta.date,
    ...(counterparty ? { counterparty } : {}),
    cardsOut: mine.cards.map((c) => toLogCard(c, mine, settings)),
    cardsIn: theirs.cards.map((c) => toLogCard(c, theirs, settings)),
    cash: {
      out: mine.cash.reduce((s, c) => s + c.amount, 0),
      in: theirs.cash.reduce((s, c) => s + c.amount, 0),
    },
    totals: { out: sideTotals(mine, settings).total, in: sideTotals(theirs, settings).total },
    ...(notes ? { notes } : {}),
  };
}

export interface ApplyTradeResult {
  collection: Collection;
  /** Copies leaving that the collection did not hold. Never negative; quantity is the unmet part. */
  shortfall: TradeLogCard[];
}

/** Takes up to `qty` from the printings picked by `pick`, mutating the working copy. Returns the amount taken. */
function takeFrom(printings: CollectionPrinting[], qty: number, pick: (p: CollectionPrinting) => boolean): number {
  let taken = 0;
  const candidates = printings.filter((p) => p.quantity > 0 && pick(p)).sort((a, b) => b.quantity - a.quantity);
  for (const p of candidates) {
    if (taken >= qty) break;
    const n = Math.min(p.quantity, qty - taken);
    p.quantity -= n;
    taken += n;
  }
  return taken;
}

/**
 * Applies a logged trade to the Collection: cards out are removed, cards in are merged as full printings.
 * Pure: the input collection is not modified. This is the only place a trade changes the Collection.
 *
 * Out: exact printing (set, collector number, foil-ness) first, then a generic printing (no set or
 * number), then any other printing of the name, largest first. Condition is not stored in Collection.
 */
export function applyTradeToCollection(
  collection: Collection,
  cardsOut: TradeLogCard[],
  cardsIn: TradeLogCard[],
): ApplyTradeResult {
  const next: Collection = {};
  for (const [k, v] of Object.entries(collection)) next[k] = v.map((p) => ({ ...p }));
  const shortfall: TradeLogCard[] = [];

  for (const card of cardsOut) {
    const key = collectionKey(card.name);
    const printings = next[key];
    let left = card.quantity;
    if (printings) {
      const foil = isFoilFinish(card.finish);
      left -= takeFrom(printings, left, (p) =>
        p.set?.toLowerCase() === card.set.toLowerCase() && p.collectorNumber === card.collectorNumber && Boolean(p.foil) === foil);
      if (left > 0) left -= takeFrom(printings, left, (p) => !p.set && !p.collectorNumber);
      if (left > 0) left -= takeFrom(printings, left, () => true);
      const remaining = printings.filter((p) => p.quantity > 0);
      if (remaining.length > 0) next[key] = remaining;
      else delete next[key];
    }
    if (left > 0) shortfall.push({ ...card, quantity: left });
  }

  for (const card of cardsIn) {
    if (card.quantity <= 0) continue;
    const key = collectionKey(card.name);
    const printings = next[key] ?? [];
    const foil = isFoilFinish(card.finish);
    const match = printings.find((p) =>
      p.set?.toLowerCase() === card.set.toLowerCase() && p.collectorNumber === card.collectorNumber && Boolean(p.foil) === foil);
    if (match) match.quantity += card.quantity;
    else printings.push({ quantity: card.quantity, set: card.set, collectorNumber: card.collectorNumber, ...(foil ? { foil: true } : {}) });
    next[key] = printings;
  }

  return { collection: next, shortfall };
}

/** Merge-import: keeps local entries, adds incoming ones whose id is new, newest first. */
export function mergeLedger(local: TradeLogEntry[], incoming: TradeLogEntry[]): { merged: TradeLogEntry[]; added: number } {
  const have = new Set(local.map(e => e.id));
  const fresh = incoming.filter(e => !have.has(e.id));
  return { merged: [...local, ...fresh].sort((a, b) => b.date - a.date), added: fresh.length };
}
