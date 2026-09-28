import { describe, it, expect } from "vitest";
import {
  basePriceFor,
  effectiveBase,
  resolveDiscount,
  unitPrice,
  lineTotal,
  sideTotals,
  isSideEmpty,
  fairness,
  meterShare,
} from "../tradePricing";
import { DEFAULT_SETTINGS, type TradeCard, type TradeSide } from "../../types/trade";

const card = (over: Partial<TradeCard> = {}): TradeCard => ({
  id: "c1",
  name: "Sol Ring",
  scryfallId: "s1",
  set: "cmd",
  collectorNumber: "1",
  finish: "nonfoil",
  condition: "NM",
  quantity: 1,
  basePrice: 10,
  priceFetchedAt: 0,
  source: "search",
  ...over,
});
const side = (cards: TradeCard[] = [], over: Partial<TradeSide> = {}): TradeSide => ({
  cards,
  cash: [],
  ...over,
});

describe("basePriceFor", () => {
  const prices = { usd: "1.50", usd_foil: "3.00", usd_etched: null };
  it("selects the field by finish", () => {
    expect(basePriceFor(prices, "nonfoil")).toBe(1.5);
    expect(basePriceFor(prices, "foil")).toBe(3);
  });
  it("returns null for null, missing, or unparsable prices", () => {
    expect(basePriceFor(prices, "etched")).toBeNull();
    expect(basePriceFor(undefined, "nonfoil")).toBeNull();
    expect(basePriceFor({ usd: "abc" }, "nonfoil")).toBeNull();
  });
});

describe("effectiveBase", () => {
  it("applies the condition multiplier", () => {
    expect(effectiveBase(card({ condition: "LP" }))).toBeCloseTo(9);
    expect(effectiveBase(card({ condition: "DMG" }))).toBeCloseTo(4);
  });
  it("manual price skips the condition multiplier", () => {
    expect(effectiveBase(card({ condition: "HP", manualPrice: 8 }))).toBe(8);
  });
  it("manual price works when there is no base price", () => {
    expect(effectiveBase(card({ basePrice: null, manualPrice: 2 }))).toBe(2);
  });
  it("is null with no base and no manual price", () => {
    expect(effectiveBase(card({ basePrice: null }))).toBeNull();
  });
});

describe("discount precedence", () => {
  it("card > side > global", () => {
    const s = side([], { discountOverridePct: 20 });
    expect(resolveDiscount(card({ discountOverridePct: 5 }), s, DEFAULT_SETTINGS)).toBe(5);
    expect(resolveDiscount(card(), s, DEFAULT_SETTINGS)).toBe(20);
    expect(resolveDiscount(card(), side(), DEFAULT_SETTINGS)).toBe(10);
  });
  it("respects a 0% override", () => {
    expect(resolveDiscount(card({ discountOverridePct: 0 }), side(), DEFAULT_SETTINGS)).toBe(0);
  });
});

describe("unit price and line total", () => {
  it("applies the discount to the effective base", () => {
    expect(unitPrice(card(), side(), DEFAULT_SETTINGS)).toBeCloseTo(9);
  });
  it("discount still applies to manual price", () => {
    expect(unitPrice(card({ manualPrice: 20 }), side(), DEFAULT_SETTINGS)).toBeCloseTo(18);
  });
  it("multiplies by quantity, with no mid-calculation rounding", () => {
    const c = card({ basePrice: 0.333, quantity: 3 });
    expect(lineTotal(c, side(), { discountPct: 0, tolerancePct: 10 })).toBeCloseTo(0.999, 6);
  });
  it("null-price rows contribute 0", () => {
    expect(lineTotal(card({ basePrice: null }), side(), DEFAULT_SETTINGS)).toBe(0);
  });
});

describe("sideTotals", () => {
  it("adds cash at face value, undiscounted", () => {
    const s = side([card()], { cash: [{ id: "x", amount: 5 }] });
    const t = sideTotals(s, DEFAULT_SETTINGS);
    expect(t.cardsTotal).toBeCloseTo(9);
    expect(t.cashTotal).toBe(5);
    expect(t.total).toBeCloseTo(14);
  });
  it("counts missing prices", () => {
    const s = side([card({ basePrice: null }), card({ id: "c2" })]);
    expect(sideTotals(s, DEFAULT_SETTINGS).missingPriceCount).toBe(1);
  });
  it("empty side totals 0", () => {
    expect(sideTotals(side(), DEFAULT_SETTINGS).total).toBe(0);
  });
});

describe("isSideEmpty", () => {
  it("is empty only with no cards and no cash", () => {
    expect(isSideEmpty(side())).toBe(true);
    expect(isSideEmpty(side([card()]))).toBe(false);
    expect(isSideEmpty(side([], { cash: [{ id: "x", amount: 1 }] }))).toBe(false);
  });
});

describe("fairness", () => {
  it("is fair within tolerance (boundary inclusive)", () => {
    expect(fairness(100, 90, 10).band).toBe("fair");
  });
  it("is leaning between tolerance and 25", () => {
    expect(fairness(100, 80, 10).band).toBe("leaning");
    expect(fairness(100, 75, 10).band).toBe("leaning");
  });
  it("is lopsided above 25", () => {
    expect(fairness(100, 70, 10).band).toBe("lopsided");
  });
  it("cutoff scales with tolerance: max(25, tol + 15)", () => {
    expect(fairness(100, 55, 30).band).toBe("leaning"); // 45% <= 45
    expect(fairness(100, 50, 30).band).toBe("lopsided");
  });
  it("favors the side receiving more value", () => {
    expect(fairness(100, 50, 10).favors).toBe("them");
    expect(fairness(50, 100, 10).favors).toBe("me");
    expect(fairness(50, 50, 10).favors).toBe("even");
  });
  it("reports delta and balance hint", () => {
    const f = fairness(100, 60, 10);
    expect(f.delta).toBe(40);
    expect(f.deltaPct).toBeCloseTo(40);
    expect(f.balanceHint).toBe(40);
  });
  it("both zero gives 0%", () => {
    expect(fairness(0, 0, 10).deltaPct).toBe(0);
  });
});

describe("meterShare", () => {
  it("is mine / (mine + theirs)", () => {
    expect(meterShare(30, 70)).toBeCloseTo(0.3);
  });
  it("is centered when both zero", () => {
    expect(meterShare(0, 0)).toBe(0.5);
  });
});
