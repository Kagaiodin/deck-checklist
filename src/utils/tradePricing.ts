import {
  CONDITION_MULTIPLIERS,
  type Finish,
  type TradeCard,
  type TradeSettings,
  type TradeSide,
} from "../types/trade";

export interface ScryfallPrices {
  usd?: string | null;
  usd_foil?: string | null;
  usd_etched?: string | null;
}

/** Picks the Scryfall price field for a finish. Null when unavailable. */
export function basePriceFor(prices: ScryfallPrices | undefined, finish: Finish): number | null {
  if (!prices) return null;
  const raw =
    finish === "foil" ? prices.usd_foil : finish === "etched" ? prices.usd_etched : prices.usd;
  if (raw == null) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/** manualPrice replaces basePrice × condition (condition skipped). Null when no price. */
export function effectiveBase(card: TradeCard): number | null {
  if (card.manualPrice !== undefined) return card.manualPrice;
  if (card.basePrice === null) return null;
  return card.basePrice * CONDITION_MULTIPLIERS[card.condition];
}

/** card override > side override > global. */
export function resolveDiscount(
  card: TradeCard,
  side: Pick<TradeSide, "discountOverridePct">,
  settings: TradeSettings
): number {
  return card.discountOverridePct ?? side.discountOverridePct ?? settings.discountPct;
}

export function unitPrice(
  card: TradeCard,
  side: Pick<TradeSide, "discountOverridePct">,
  settings: TradeSettings
): number | null {
  const base = effectiveBase(card);
  if (base === null) return null;
  return base * (1 - resolveDiscount(card, side, settings) / 100);
}

export function lineTotal(
  card: TradeCard,
  side: Pick<TradeSide, "discountOverridePct">,
  settings: TradeSettings
): number {
  return (unitPrice(card, side, settings) ?? 0) * card.quantity;
}

export interface SideTotals {
  total: number;
  cardsTotal: number;
  cashTotal: number;
  missingPriceCount: number;
}

export function sideTotals(side: TradeSide, settings: TradeSettings): SideTotals {
  let cardsTotal = 0;
  let missingPriceCount = 0;
  for (const card of side.cards) {
    if (unitPrice(card, side, settings) === null) missingPriceCount++;
    cardsTotal += lineTotal(card, side, settings);
  }
  const cashTotal = side.cash.reduce((sum, c) => sum + c.amount, 0);
  return { total: cardsTotal + cashTotal, cardsTotal, cashTotal, missingPriceCount };
}

export const isSideEmpty = (side: TradeSide) => side.cards.length === 0 && side.cash.length === 0;

export interface Fairness {
  delta: number;
  deltaPct: number;
  favors: "me" | "them" | "even";
  band: "fair" | "leaning" | "lopsided";
  balanceHint: number;
}

export function fairness(mineTotal: number, theirTotal: number, tolerancePct: number): Fairness {
  const delta = mineTotal - theirTotal;
  const max = Math.max(mineTotal, theirTotal);
  const deltaPct = max === 0 ? 0 : (Math.abs(delta) / max) * 100;
  // The side receiving more value than it gives is favored: I give more → they are favored.
  const favors = delta === 0 ? "even" : delta > 0 ? "them" : "me";
  const band =
    deltaPct <= tolerancePct
      ? "fair"
      : deltaPct <= Math.max(25, tolerancePct + 15)
        ? "leaning"
        : "lopsided";
  return { delta, deltaPct, favors, band, balanceHint: Math.abs(delta) };
}

/** Meter share for My side (0–1); 0.5 when both are zero. */
export function meterShare(mineTotal: number, theirTotal: number): number {
  const sum = mineTotal + theirTotal;
  return sum === 0 ? 0.5 : mineTotal / sum;
}
