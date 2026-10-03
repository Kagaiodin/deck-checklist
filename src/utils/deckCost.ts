import type { Card, Deck } from "../types/index";

// Scryfall price fields come back as decimal strings, or null when no price exists.
export interface ScryfallUsdPrices {
  usd?: string | null;
  usd_foil?: string | null;
}

const SCRYFALL_BATCH_SIZE = 75;
const SCRYFALL_COLLECTION_URL = "https://api.scryfall.com/cards/collection";
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

// Decks carry no finish, so use the nonfoil price and only fall back to foil
// for printings that exist in foil only.
export function pickUsdPrice(prices: ScryfallUsdPrices | undefined): number | undefined {
  const raw = prices?.usd ?? prices?.usd_foil;
  if (raw == null) return undefined;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : undefined;
}

export interface CostToComplete {
  remaining: number;     // USD still to spend: missing cards only, never the owned side
  missingCount: number;  // copies still to acquire (need_to_buy or untagged, not acquired)
  unpricedCount: number; // missing copies with no price (counted as $0)
  orderedCount: number;  // copies already ordered (excluded from remaining)
  pricedCount: number;   // copies in the whole deck that carry a price, used to tell "not loaded yet" from "nothing to buy"
  toBuyCount: number;    // missing copies tagged need_to_buy
  toBuyCost: number;     // USD for those copies
  untaggedCount: number; // missing copies with no source tag
  untaggedCost: number;  // USD for those copies; toBuyCost + untaggedCost === remaining
}

export function computeCostToComplete(cards: Card[]): CostToComplete {
  const result: CostToComplete = {
    remaining: 0, missingCount: 0, unpricedCount: 0, orderedCount: 0, pricedCount: 0,
    toBuyCount: 0, toBuyCost: 0, untaggedCount: 0, untaggedCost: 0,
  };
  for (const card of cards) {
    if (card.price !== undefined) result.pricedCount += card.quantity;
    if (card.source === "ordered") result.orderedCount += card.quantity;
    const isMissing = !card.acquired && (card.source === undefined || card.source === "need_to_buy");
    if (!isMissing) continue;
    result.missingCount += card.quantity;
    const cost = card.price === undefined ? 0 : card.price * card.quantity;
    if (card.price === undefined) result.unpricedCount += card.quantity;
    if (card.source === undefined) {
      result.untaggedCount += card.quantity;
      result.untaggedCost += cost;
    } else {
      result.toBuyCount += card.quantity;
      result.toBuyCost += cost;
    }
  }
  result.remaining = result.toBuyCost + result.untaggedCost;
  return result;
}

export function formatCostAmount(amount: number): string {
  if (amount > 0 && amount < 1) return "<$1";
  return `~$${Math.round(amount).toLocaleString("en-US")}`;
}

export function needsPriceRefresh(deck: Deck, now: number): boolean {
  if (deck.cards.length === 0) return false;
  return deck.pricesUpdatedAt === undefined || now - deck.pricesUpdatedAt > STALE_AFTER_MS;
}

export function describePricesAge(updatedAt: number, now: number): { label: string; stale: boolean } {
  const stale = now - updatedAt > STALE_AFTER_MS;
  const when = new Date(updatedAt);
  const sameDay = when.toDateString() === new Date(now).toDateString();
  const time = when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const date = when.toLocaleDateString([], { month: "short", day: "numeric" });
  if (stale) return { label: `Prices from ${date}, ${time}`, stale };
  return { label: `Prices as of ${sameDay ? time : date}`, stale };
}

export interface PriceRefreshResult {
  // Keyed by card id. null = Scryfall knows the card but has no price.
  // Cards from a failed batch are absent so the caller keeps their prior price.
  prices: Record<string, number | null>;
  ok: boolean; // false if any batch failed
}

export async function refreshDeckPrices(cards: Card[]): Promise<PriceRefreshResult> {
  const ids = [...new Set(cards.map(c => c.id))];
  const prices: Record<string, number | null> = {};
  let ok = true;

  for (let i = 0; i < ids.length; i += SCRYFALL_BATCH_SIZE) {
    const identifiers = ids.slice(i, i + SCRYFALL_BATCH_SIZE).map(id => ({ id }));
    try {
      const res = await fetch(SCRYFALL_COLLECTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers }),
      });
      if (!res.ok) { ok = false; continue; }
      const body = await res.json() as { data?: { id: string; prices?: ScryfallUsdPrices }[] };
      for (const sc of body.data ?? []) prices[sc.id] = pickUsdPrice(sc.prices) ?? null;
    } catch {
      ok = false;
    }
  }

  return { prices, ok };
}
