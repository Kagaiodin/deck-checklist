import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  pickUsdPrice,
  computeCostToComplete,
  refreshDeckPrices,
  needsPriceRefresh,
  describePricesAge,
  formatCostAmount,
} from "../deckCost";
import type { Card, Deck } from "../../types/index";

function makeCard(overrides: Partial<Card> & { id: string }): Card {
  return {
    name: overrides.id,
    quantity: 1,
    acquired: false,
    color: [],
    type: "Instant",
    ...overrides,
  };
}

// ── pickUsdPrice ──────────────────────────────────────────────────────────────

describe("pickUsdPrice", () => {
  it("parses prices.usd", () => {
    expect(pickUsdPrice({ usd: "1.25", usd_foil: "3.00" })).toBe(1.25);
  });

  it("falls back to usd_foil when usd is null (foil-only printing)", () => {
    expect(pickUsdPrice({ usd: null, usd_foil: "4.50" })).toBe(4.5);
  });

  it("returns undefined when neither price exists", () => {
    expect(pickUsdPrice({ usd: null, usd_foil: null })).toBeUndefined();
    expect(pickUsdPrice({})).toBeUndefined();
    expect(pickUsdPrice(undefined)).toBeUndefined();
  });

  it("returns undefined for a non-numeric value", () => {
    expect(pickUsdPrice({ usd: "abc" })).toBeUndefined();
  });

  it("treats a real $0.00 price as a price, not as missing", () => {
    expect(pickUsdPrice({ usd: "0.00" })).toBe(0);
  });
});

// ── computeCostToComplete ─────────────────────────────────────────────────────

describe("computeCostToComplete", () => {
  it("sums price × quantity for need_to_buy cards", () => {
    const cards = [
      makeCard({ id: "a", source: "need_to_buy", price: 2.5, quantity: 4 }),
      makeCard({ id: "b", source: "need_to_buy", price: 10 }),
    ];
    const r = computeCostToComplete(cards);
    expect(r.remaining).toBeCloseTo(20);
    expect(r.missingCount).toBe(5);
  });

  it("counts untagged, unacquired cards as missing", () => {
    const r = computeCostToComplete([makeCard({ id: "a", price: 3, quantity: 2 })]);
    expect(r.remaining).toBe(6);
    expect(r.missingCount).toBe(2);
  });

  it("excludes owned, proxy, in_another_deck, borrowed, in_binder and in_storage", () => {
    const sources = ["owned", "proxy", "in_another_deck", "borrowed", "in_binder", "in_storage"] as const;
    const cards = sources.map(s => makeCard({ id: s, source: s, price: 50 }));
    const r = computeCostToComplete(cards);
    expect(r.remaining).toBe(0);
    expect(r.missingCount).toBe(0);
  });

  it("excludes acquired cards even when they are untagged", () => {
    const r = computeCostToComplete([makeCard({ id: "a", acquired: true, price: 9 })]);
    expect(r.remaining).toBe(0);
    expect(r.missingCount).toBe(0);
  });

  it("excludes ordered cards from the total but reports their quantity", () => {
    const cards = [
      makeCard({ id: "a", source: "ordered", price: 20, quantity: 2 }),
      makeCard({ id: "b", source: "need_to_buy", price: 5 }),
    ];
    const r = computeCostToComplete(cards);
    expect(r.remaining).toBe(5);
    expect(r.orderedCount).toBe(2);
  });

  it("counts missing cards without a price as unpriced and adds $0", () => {
    const cards = [
      makeCard({ id: "a", source: "need_to_buy", price: 8 }),
      makeCard({ id: "b", source: "need_to_buy", quantity: 3 }),
    ];
    const r = computeCostToComplete(cards);
    expect(r.remaining).toBe(8);
    expect(r.unpricedCount).toBe(3);
  });

  it("does not count unpriced cards that are not missing", () => {
    const r = computeCostToComplete([makeCard({ id: "a", source: "owned" })]);
    expect(r.unpricedCount).toBe(0);
  });

  it("responds to a card being re-tagged", () => {
    const before = [makeCard({ id: "a", source: "need_to_buy", price: 12 })];
    const after = [{ ...before[0], source: "owned" as const }];
    expect(computeCostToComplete(before).remaining).toBe(12);
    expect(computeCostToComplete(after).remaining).toBe(0);
  });

  it("handles an empty deck", () => {
    expect(computeCostToComplete([])).toEqual({
      remaining: 0,
      missingCount: 0,
      unpricedCount: 0,
      orderedCount: 0,
      pricedCount: 0,
      toBuyCount: 0,
      toBuyCost: 0,
      untaggedCount: 0,
      untaggedCost: 0,
    });
  });

  it("reports how many cards in the whole deck carry a price", () => {
    const cards = [
      makeCard({ id: "a", source: "owned", price: 1, quantity: 2 }),
      makeCard({ id: "b", source: "need_to_buy" }),
    ];
    expect(computeCostToComplete(cards).pricedCount).toBe(2);
  });
});

// ── formatCostAmount ──────────────────────────────────────────────────────────

describe("computeCostToComplete split", () => {
  it("splits a mixed deck into to-buy and untagged that sum to remaining", () => {
    const r = computeCostToComplete([
      makeCard({ id: "a", source: "need_to_buy", price: 10, quantity: 2 }),
      makeCard({ id: "b", price: 4.5, quantity: 3 }),
      makeCard({ id: "c", source: "need_to_buy", price: 0.1 }),
      makeCard({ id: "d", price: 0.2 }),
    ]);
    expect(r.toBuyCount).toBe(3);
    expect(r.toBuyCost).toBeCloseTo(20.1);
    expect(r.untaggedCount).toBe(4);
    expect(r.untaggedCost).toBeCloseTo(13.7);
    expect(r.toBuyCost + r.untaggedCost).toBe(r.remaining);
    expect(r.toBuyCount + r.untaggedCount).toBe(r.missingCount);
  });

  it("reports an untagged-only deck with a zero to-buy row", () => {
    const r = computeCostToComplete([makeCard({ id: "a", price: 5, quantity: 2 })]);
    expect(r).toMatchObject({ toBuyCount: 0, toBuyCost: 0, untaggedCount: 2, untaggedCost: 10, remaining: 10 });
  });

  it("reports a to-buy-only deck with a zero untagged row", () => {
    const r = computeCostToComplete([makeCard({ id: "a", source: "need_to_buy", price: 5, quantity: 2 })]);
    expect(r).toMatchObject({ toBuyCount: 2, toBuyCost: 10, untaggedCount: 0, untaggedCost: 0, remaining: 10 });
  });

  it("excludes acquired cards from both rows", () => {
    const r = computeCostToComplete([
      makeCard({ id: "a", source: "need_to_buy", acquired: true, price: 50 }),
      makeCard({ id: "b", acquired: true, price: 50 }),
      makeCard({ id: "c", source: "need_to_buy", price: 3 }),
    ]);
    expect(r).toMatchObject({ toBuyCount: 1, toBuyCost: 3, untaggedCount: 0, untaggedCost: 0 });
  });

  it("counts unpriced copies in their row's count but not its cost", () => {
    const r = computeCostToComplete([
      makeCard({ id: "a", source: "need_to_buy", quantity: 2 }),
      makeCard({ id: "b", price: 7 }),
    ]);
    expect(r).toMatchObject({ toBuyCount: 2, toBuyCost: 0, untaggedCount: 1, untaggedCost: 7, unpricedCount: 2 });
  });
});

describe("formatCostAmount", () => {
  it("rounds to whole dollars", () => {
    expect(formatCostAmount(86.4)).toBe("~$86");
    expect(formatCostAmount(86.5)).toBe("~$87");
  });

  it("shows <$1 for a positive amount under a dollar", () => {
    expect(formatCostAmount(0.3)).toBe("<$1");
  });

  it("shows ~$0 for zero", () => {
    expect(formatCostAmount(0)).toBe("~$0");
  });

  it("adds thousands separators", () => {
    expect(formatCostAmount(1234.2)).toBe("~$1,234");
  });
});

// ── needsPriceRefresh / describePricesAge ─────────────────────────────────────

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-09-30T15:00:00").getTime();

function deckWith(overrides: Partial<Deck>): Deck {
  return { id: "d", name: "D", cards: [], createdAt: 0, ...overrides };
}

describe("needsPriceRefresh", () => {
  it("is true when the deck has never been priced", () => {
    expect(needsPriceRefresh(deckWith({ cards: [makeCard({ id: "a" })] }), NOW)).toBe(true);
  });

  it("is false for a fresh price", () => {
    expect(needsPriceRefresh(deckWith({ cards: [makeCard({ id: "a" })], pricesUpdatedAt: NOW - HOUR }), NOW)).toBe(false);
  });

  it("is true once prices are older than 24 hours", () => {
    expect(needsPriceRefresh(deckWith({ cards: [makeCard({ id: "a" })], pricesUpdatedAt: NOW - 25 * HOUR }), NOW)).toBe(true);
  });

  it("is false for an empty deck", () => {
    expect(needsPriceRefresh(deckWith({}), NOW)).toBe(false);
  });
});

describe("describePricesAge", () => {
  it("is not stale and uses 'as of' for today's prices", () => {
    const r = describePricesAge(NOW - HOUR, NOW);
    expect(r.stale).toBe(false);
    expect(r.label).toMatch(/^Prices as of /);
  });

  it("is stale and uses 'from' once older than 24 hours", () => {
    const r = describePricesAge(NOW - 30 * HOUR, NOW);
    expect(r.stale).toBe(true);
    expect(r.label).toMatch(/^Prices from /);
  });
});

// ── refreshDeckPrices ─────────────────────────────────────────────────────────

describe("refreshDeckPrices", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetchOnce(body: unknown, ok = true) {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok, json: async () => body });
  }

  it("returns prices keyed by card id", async () => {
    mockFetchOnce({ data: [{ id: "a", prices: { usd: "2.00" } }, { id: "b", prices: { usd: null, usd_foil: "5.00" } }] });
    const r = await refreshDeckPrices([makeCard({ id: "a" }), makeCard({ id: "b" })]);
    expect(r.prices).toEqual({ a: 2, b: 5 });
    expect(r.ok).toBe(true);
  });

  it("maps a found card with no price to null (clears a stale price)", async () => {
    mockFetchOnce({ data: [{ id: "a", prices: {} }] });
    const r = await refreshDeckPrices([makeCard({ id: "a" })]);
    expect(r.prices).toEqual({ a: null });
  });

  it("batches requests at 75 ids", async () => {
    const cards = Array.from({ length: 160 }, (_, i) => makeCard({ id: `c${i}` }));
    mockFetchOnce({ data: [] });
    mockFetchOnce({ data: [] });
    mockFetchOnce({ data: [] });
    await refreshDeckPrices(cards);
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(3);
    const sizes = calls.map(c => JSON.parse(c[1].body).identifiers.length);
    expect(sizes).toEqual([75, 75, 10]);
  });

  it("omits cards from a failed batch so prior prices are kept, and reports not ok", async () => {
    const cards = Array.from({ length: 80 }, (_, i) => makeCard({ id: `c${i}` }));
    mockFetchOnce({ data: [{ id: "c0", prices: { usd: "1.00" } }] });
    mockFetchOnce({}, false);
    const r = await refreshDeckPrices(cards);
    expect(r.prices).toEqual({ c0: 1 });
    expect(r.ok).toBe(false);
  });

  it("survives a network error without throwing", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("offline"));
    const r = await refreshDeckPrices([makeCard({ id: "a" })]);
    expect(r.prices).toEqual({});
    expect(r.ok).toBe(false);
  });

  it("does not call fetch for an empty deck", async () => {
    const r = await refreshDeckPrices([]);
    expect(fetch).not.toHaveBeenCalled();
    expect(r).toEqual({ prices: {}, ok: true });
  });
});
