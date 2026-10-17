import { describe, it, expect } from "vitest";
import { buildDemoData } from "../demoData";
import { MANAGED_KEYS } from "../demoMode";
import { getDeckColorIdentity } from "../../../utils/deckUtils";
import { computeCostToComplete } from "../../../utils/deckCost";
import { fairness, sideTotals } from "../../../utils/tradePricing";
import type { Deck, Order, Collection } from "../../../types/index";
import type { Trade } from "../../../types/trade";

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);
const DAY = 86_400_000;

const data = buildDemoData(NOW);
const decks = JSON.parse(data["mtg-checklist-decks"]!) as Deck[];
const orders = JSON.parse(data["mtg-checklist-orders-v1"]!) as Order[];
const collection = JSON.parse(data["mtg-checklist-collection-v2"]!) as Collection;
const trade = JSON.parse(data["fetchlist-trade"]!) as Trade;

const progress = (d: Deck) => {
  const total = d.cards.reduce((s, c) => s + c.quantity, 0);
  const have = d.cards.filter((c) => c.acquired).reduce((s, c) => s + c.quantity, 0);
  return have / total;
};

describe("buildDemoData", () => {
  it("only sets managed keys, as JSON strings, and skips onboarding via the dismissed flag", () => {
    for (const key of Object.keys(data)) expect(MANAGED_KEYS).toContain(key);
    expect(data["fetchlist:onboarding:dismissed"]).toBe("true");
    expect(data["mtg-checklist-errors"]).toBe("{}");
  });

  it("has three decks at different stages: nearly done and Built, mid-build, just started", () => {
    expect(decks).toHaveLength(3);
    const [a, b, c] = decks;
    expect(progress(a)).toBeGreaterThan(0.85);
    expect(a.isBuilt).toBe(true);
    expect(progress(b)).toBeGreaterThan(0.3);
    expect(progress(b)).toBeLessThan(0.7);
    expect(progress(c)).toBeLessThan(0.4);
  });

  it("builds full 100-card Commander decks, singleton apart from basic lands", () => {
    for (const d of decks) {
      expect(d.cards.reduce((s, c) => s + c.quantity, 0)).toBe(100);
      for (const c of d.cards.filter((c) => !c.type.startsWith("Basic Land"))) expect(c.quantity).toBe(1);
      expect(new Set(d.cards.map((c) => c.name)).size).toBe(d.cards.length);
    }
  });

  it("includes a five-color deck for the mana pie", () => {
    expect(decks.some((d) => getDeckColorIdentity(d).length === 5)).toBe(true);
  });

  it("gives cost-to-complete real numbers without any Scryfall lookup", () => {
    for (const d of decks.slice(1)) {
      const cost = computeCostToComplete(d.cards);
      expect(cost.remaining).toBeGreaterThan(0);
      expect(cost.unpricedCount).toBe(0);
    }
  });

  it("feeds the buy list: the just-started deck has many unowned cards", () => {
    const unowned = decks[2].cards.filter((c) => !c.acquired && c.source !== "ordered");
    expect(unowned.length).toBeGreaterThanOrEqual(10);
  });

  it("has unique ids across decks and cards", () => {
    const deckIds = decks.map((d) => d.id);
    expect(new Set(deckIds).size).toBe(deckIds.length);
    for (const d of decks) expect(new Set(d.cards.map((c) => c.id)).size).toBe(d.cards.length);
  });

  it("covers every order status, including a late active order", () => {
    expect(new Set(orders.map((o) => o.status))).toEqual(new Set(["active", "received", "cancelled"]));
    expect(orders.some((o) => o.status === "active" && o.expectedArrival !== undefined && o.expectedArrival < NOW)).toBe(true);
    expect(orders.some((o) => o.status === "active" && o.expectedArrival !== undefined && o.expectedArrival > NOW)).toBe(true);
  });

  it("generates every date relative to now (never ancient, never far future)", () => {
    for (const o of orders) {
      for (const ts of [o.createdAt, o.orderDate, o.expectedArrival]) {
        if (ts === undefined) continue;
        expect(ts).toBeGreaterThan(NOW - 60 * DAY);
        expect(ts).toBeLessThan(NOW + 30 * DAY);
      }
    }
    const later = buildDemoData(NOW + 10 * DAY);
    const laterOrders = JSON.parse(later["mtg-checklist-orders-v1"]!) as Order[];
    expect(laterOrders[0].createdAt - orders[0].createdAt).toBe(10 * DAY);
  });

  it("links ordered deck cards to orders and vendors to vendor history", () => {
    const history = JSON.parse(data["mtg-checklist-vendor-history"]!) as string[];
    for (const o of orders) expect(history).toContain(o.vendor);
    const orderedCardIds = new Set(orders.flatMap((o) => o.cards.map((c) => c.cardId).filter(Boolean)));
    for (const d of decks) {
      for (const c of d.cards.filter((c) => c.source === "ordered")) {
        expect(orderedCardIds.has(c.id)).toBe(true);
      }
    }
  });

  it("keeps the collection consistent with acquired deck cards", () => {
    for (const d of decks) {
      for (const c of d.cards.filter((c) => c.acquired && c.source === "owned")) {
        expect(collection[c.name.toLowerCase()]?.length).toBeGreaterThan(0);
      }
    }
    const meta = JSON.parse(data["mtg-checklist-collection-meta-v2"]!);
    expect(meta.cardCount).toBe(Object.keys(collection).length);
  });

  it("has one lopsided trade with priced cards and a cash line", () => {
    expect(trade.mine.cards.length).toBeGreaterThan(0);
    expect(trade.theirs.cards.length).toBeGreaterThan(0);
    expect(trade.mine.cash.length + trade.theirs.cash.length).toBeGreaterThan(0);
    const mine = sideTotals(trade.mine, trade.settings).total;
    const theirs = sideTotals(trade.theirs, trade.settings).total;
    expect(fairness(mine, theirs, trade.settings.tolerancePct).band).toBe("lopsided");
  });
});
