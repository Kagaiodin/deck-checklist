export type Finish = "nonfoil" | "foil" | "etched";
export type Condition = "NM" | "LP" | "MP" | "HP" | "DMG";

export interface TradeCard {
  id: string;
  name: string;
  scryfallId: string;
  set: string;
  collectorNumber: string;
  finish: Finish;
  condition: Condition;
  quantity: number;
  imageUrl?: string;
  basePrice: number | null;
  priceFetchedAt: number | null;
  manualPrice?: number;
  discountOverridePct?: number;
  source: "collection" | "search";
}

export interface CashLine {
  id: string;
  amount: number;
}

export interface TradeSide {
  cards: TradeCard[];
  cash: CashLine[];
  discountOverridePct?: number;
}

export interface TradeSettings {
  discountPct: number;
  tolerancePct: number;
}

export interface Trade {
  mine: TradeSide;
  theirs: TradeSide;
  settings: TradeSettings;
  readOnly: boolean;
}

export const CONDITIONS: Condition[] = ["NM", "LP", "MP", "HP", "DMG"];

export const CONDITION_MULTIPLIERS: Record<Condition, number> = {
  NM: 1.0,
  LP: 0.9,
  MP: 0.75,
  HP: 0.55,
  DMG: 0.4,
};

export const DEFAULT_SETTINGS: TradeSettings = { discountPct: 10, tolerancePct: 10 };

/** One card line in a logged trade. `unitPrice` is the price at log time, after condition and discount. */
export interface TradeLogCard {
  name: string;
  scryfallId: string;
  set: string;
  collectorNumber: string;
  finish: Finish;
  condition: Condition;
  quantity: number;
  /** Null = no price at log time; the card is left out of the totals. */
  unitPrice: number | null;
}

/** A trade the user confirmed in "Log this trade". Prices are snapshots, never recomputed. */
export interface TradeLogEntry {
  id: string;
  /** Epoch ms. */
  date: number;
  counterparty?: string;
  /** Trade.mine.cards ("I give"). */
  cardsOut: TradeLogCard[];
  /** Trade.theirs.cards ("I get"). Empty for a straight sale. */
  cardsIn: TradeLogCard[];
  cash: { out: number; in: number };
  /** sideTotals(...).total at log time, cash included. */
  totals: { out: number; in: number };
  notes?: string;
}
