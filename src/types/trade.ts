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
