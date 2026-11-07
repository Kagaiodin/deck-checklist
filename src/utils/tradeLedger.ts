import type { Collection, CollectionPrinting } from "../types/index";
import type { Trade, TradeCard, TradeLogCard, TradeLogEntry, TradeSide } from "../types/trade";
import { sideTotals, unitPrice } from "./tradePricing";
import { getFrontFaceName } from "./dualface";
import { usd } from "../features/trade/format";
import { printingOf, samePrinting } from "./printing";

export interface LogMeta {
  date: number;
  counterparty?: string;
  notes?: string;
}

/** Collection keys are lowercased front-face names; trade cards may carry the full "A // B" name. */
export function collectionKey(name: string): string {
  return getFrontFaceName(name).toLowerCase();
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
      const printing = printingOf(card);
      left -= takeFrom(printings, left, (p) => samePrinting(p, printing));
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
    const printing = printingOf(card);
    const match = printings.find((p) => samePrinting(p, printing));
    if (match) match.quantity += card.quantity;
    else printings.push({ quantity: card.quantity, set: printing.set, collectorNumber: printing.collectorNumber, ...(printing.foil ? { foil: true } : {}) });
    next[key] = printings;
  }

  return { collection: next, shortfall };
}

/** Newest first. Stable, so entries on the same date keep their insertion order. */
export const sortLedger = (entries: TradeLogEntry[]) => [...entries].sort((a, b) => b.date - a.date);

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

function validCard(c: unknown): c is TradeLogCard {
  if (!c || typeof c !== "object") return false;
  const o = c as Record<string, unknown>;
  return isStr(o.name) && isStr(o.set) && isStr(o.collectorNumber) && isStr(o.scryfallId)
    && isStr(o.finish) && isStr(o.condition) && isNum(o.quantity) && o.quantity > 0
    && (o.unitPrice === null || isNum(o.unitPrice));
}

function validEntry(e: unknown): e is TradeLogEntry {
  if (!e || typeof e !== "object") return false;
  const o = e as Record<string, unknown>;
  const pair = (v: unknown) => !!v && typeof v === "object" && isNum((v as Record<string, unknown>).out) && isNum((v as Record<string, unknown>).in);
  return isStr(o.id) && o.id !== "" && isNum(o.date)
    && Array.isArray(o.cardsOut) && o.cardsOut.every(validCard)
    && Array.isArray(o.cardsIn) && o.cardsIn.every(validCard)
    && pair(o.cash) && pair(o.totals);
}

/** Backups are untrusted: keep only well-formed entries (unique ids), drop the rest. */
export function sanitizeLedger(raw: unknown): TradeLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: TradeLogEntry[] = [];
  for (const e of raw) {
    if (!validEntry(e) || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

/** Merge-import: keeps local entries, adds incoming ones whose id is new, newest first. */
export function mergeLedger(local: TradeLogEntry[], incoming: TradeLogEntry[]): { merged: TradeLogEntry[]; added: number } {
  const have = new Set(local.map(e => e.id));
  const fresh: TradeLogEntry[] = [];
  for (const e of incoming) {
    if (have.has(e.id)) continue;
    have.add(e.id);
    fresh.push(e);
  }
  return { merged: sortLedger([...local, ...fresh]), added: fresh.length };
}

const fmtLedgerDate = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Plain-text invoice for a ledger entry, from the stored snapshot only (no repricing). Mirrors the Invoice view. */
export function ledgerEntryToText(entry: TradeLogEntry): string {
  const line = (c: TradeLogCard) => {
    const finish = c.finish === "nonfoil" ? "" : ` ${c.finish}`;
    const price = c.unitPrice === null ? "no price" : usd(c.unitPrice * c.quantity);
    return `  ${c.quantity}x ${c.name} (${c.set.toUpperCase()} ${c.collectorNumber}${finish}, ${c.condition}) — ${price}`;
  };
  const header = [fmtLedgerDate(entry.date), entry.counterparty].filter(Boolean).join(" · ");
  const out: string[] = ["Trade invoice", header];
  if (entry.cardsOut.length) out.push("", "Cards given", ...entry.cardsOut.map(line));
  if (entry.cardsIn.length) out.push("", "Cards received", ...entry.cardsIn.map(line));
  out.push("");
  if (entry.cardsOut.length || entry.cash.out > 0) out.push(`Given total: ${usd(entry.totals.out)}`);
  if (entry.cardsIn.length || entry.cash.in > 0) out.push(`Received total: ${usd(entry.totals.in)}`);
  if (entry.cash.out > 0) out.push(`Cash given: ${usd(entry.cash.out)}`);
  if (entry.cash.in > 0) out.push(`Cash received: ${usd(entry.cash.in)}`);
  if (entry.notes) out.push(`Notes: ${entry.notes}`);
  out.push("Prices as logged.");
  return out.join("\n");
}
