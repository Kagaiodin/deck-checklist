import { describe, it, expect } from "vitest";
import { applyTradeToCollection, tradeToLogEntry, collectionKey, mergeLedger } from "../tradeLedger";
import { DEFAULT_SETTINGS, type Trade, type TradeCard, type TradeLogCard } from "../../types/trade";
import type { Collection } from "../../types/index";

const log = (over: Partial<TradeLogCard> = {}): TradeLogCard => ({
  name: "Sol Ring", scryfallId: "x", set: "cmm", collectorNumber: "410", finish: "nonfoil", condition: "NM", quantity: 1, unitPrice: 1, ...over,
});
const tc = (over: Partial<TradeCard> = {}): TradeCard => ({
  id: "i", name: "Sol Ring", scryfallId: "x", set: "cmm", collectorNumber: "410", finish: "nonfoil", condition: "NM", quantity: 1,
  basePrice: 10, priceFetchedAt: 0, source: "search", ...over,
});
const trade = (mine: TradeCard[], theirs: TradeCard[], over: Partial<Trade> = {}): Trade => ({
  mine: { cards: mine, cash: [] }, theirs: { cards: theirs, cash: [] }, settings: { ...DEFAULT_SETTINGS }, readOnly: false, ...over,
});

describe("tradeToLogEntry", () => {
  it("snapshots unit prices (condition and discount applied) and totals with cash", () => {
    const t = trade([tc({ quantity: 2, condition: "LP" })], [tc({ name: "Mana Crypt", basePrice: null })]);
    t.mine.cash = [{ id: "a", amount: 5 }];
    t.theirs.cash = [{ id: "b", amount: 3 }, { id: "c", amount: 2 }];
    const e = tradeToLogEntry(t, { date: 123, counterparty: "  Sam ", notes: "  " });
    expect(e.cardsOut[0].unitPrice).toBeCloseTo(10 * 0.9 * 0.9);
    expect(e.cardsIn[0].unitPrice).toBeNull();
    expect(e.cash).toEqual({ out: 5, in: 5 });
    expect(e.totals.out).toBeCloseTo(2 * 8.1 + 5);
    expect(e.totals.in).toBe(5);
    expect(e.counterparty).toBe("Sam");
    expect(e).not.toHaveProperty("notes");
    expect(e.date).toBe(123);
    expect(e.id).toBeTruthy();
  });
  it("leaves cardsIn empty for a straight sale", () => {
    const t = trade([tc()], []);
    t.theirs.cash = [{ id: "b", amount: 8 }];
    const e = tradeToLogEntry(t, { date: 1 });
    expect(e.cardsIn).toEqual([]);
    expect(e.cash.in).toBe(8);
  });
});

describe("applyTradeToCollection: cards out", () => {
  it("takes from the exact printing and leaves the rest", () => {
    const c: Collection = { "sol ring": [{ quantity: 3, set: "cmm", collectorNumber: "410" }, { quantity: 1, set: "c21", collectorNumber: "263" }] };
    const r = applyTradeToCollection(c, [log({ quantity: 2 })], []);
    expect(r.collection["sol ring"]).toEqual([{ quantity: 1, set: "cmm", collectorNumber: "410" }, { quantity: 1, set: "c21", collectorNumber: "263" }]);
    expect(r.shortfall).toEqual([]);
  });
  it("does not mutate the input", () => {
    const c: Collection = { "sol ring": [{ quantity: 2, set: "cmm", collectorNumber: "410" }] };
    const snap = JSON.stringify(c);
    applyTradeToCollection(c, [log()], [log({ name: "Mana Crypt" })]);
    expect(JSON.stringify(c)).toBe(snap);
  });
  it("falls back to a generic printing, then any other printing, largest first", () => {
    const c: Collection = { "sol ring": [{ quantity: 1, set: "cmm", collectorNumber: "410" }, { quantity: 1 }, { quantity: 1, set: "a", collectorNumber: "1" }, { quantity: 3, set: "b", collectorNumber: "2" }] };
    const r = applyTradeToCollection(c, [log({ quantity: 4 })], []);
    // exact (1) + generic (1) + largest other "b" (2 of 3)
    expect(r.collection["sol ring"]).toEqual([{ quantity: 1, set: "a", collectorNumber: "1" }, { quantity: 1, set: "b", collectorNumber: "2" }]);
    expect(r.shortfall).toEqual([]);
  });
  it("matches foil-ness: a foil trade card does not take the non-foil printing first", () => {
    const c: Collection = { "sol ring": [{ quantity: 1, set: "cmm", collectorNumber: "410" }, { quantity: 1, set: "cmm", collectorNumber: "410", foil: true }] };
    const r = applyTradeToCollection(c, [log({ finish: "foil" })], []);
    expect(r.collection["sol ring"]).toEqual([{ quantity: 1, set: "cmm", collectorNumber: "410" }]);
  });
  it("treats etched as foil", () => {
    const c: Collection = { "sol ring": [{ quantity: 1, set: "cmm", collectorNumber: "410", foil: true }] };
    expect(applyTradeToCollection(c, [log({ finish: "etched" })], []).collection).toEqual({});
  });
  it("removes the key when nothing remains", () => {
    const r = applyTradeToCollection({ "sol ring": [{ quantity: 1, set: "cmm", collectorNumber: "410" }] }, [log()], []);
    expect(r.collection).toEqual({});
  });
  it("returns a shortfall instead of going negative", () => {
    const r = applyTradeToCollection({ "sol ring": [{ quantity: 1, set: "cmm", collectorNumber: "410" }] }, [log({ quantity: 3 })], []);
    expect(r.collection).toEqual({});
    expect(r.shortfall).toHaveLength(1);
    expect(r.shortfall[0].quantity).toBe(2);
  });
  it("reports the whole quantity as shortfall for a card not in the collection", () => {
    const r = applyTradeToCollection({}, [log({ quantity: 2 })], []);
    expect(r.collection).toEqual({});
    expect(r.shortfall[0].quantity).toBe(2);
  });
  it("matches set case-insensitively", () => {
    const r = applyTradeToCollection({ "sol ring": [{ quantity: 1, set: "CMM", collectorNumber: "410" }] }, [log()], []);
    expect(r.collection).toEqual({});
  });
});

describe("applyTradeToCollection: cards in", () => {
  it("increments the matching printing", () => {
    const r = applyTradeToCollection({ "sol ring": [{ quantity: 1, set: "cmm", collectorNumber: "410" }] }, [], [log({ quantity: 2 })]);
    expect(r.collection["sol ring"]).toEqual([{ quantity: 3, set: "cmm", collectorNumber: "410" }]);
  });
  it("adds a new full printing, with foil only when foil", () => {
    const r = applyTradeToCollection({}, [], [log({ name: "Mana Crypt", set: "2xm", collectorNumber: "1" }), log({ name: "Mana Crypt", set: "2xm", collectorNumber: "1", finish: "foil" })]);
    expect(r.collection["mana crypt"]).toEqual([
      { quantity: 1, set: "2xm", collectorNumber: "1" },
      { quantity: 1, set: "2xm", collectorNumber: "1", foil: true },
    ]);
  });
  it("applies out before in, so the same card on both sides nets out", () => {
    const c: Collection = { "sol ring": [{ quantity: 1, set: "cmm", collectorNumber: "410" }] };
    const r = applyTradeToCollection(c, [log()], [log()]);
    expect(r.collection["sol ring"]).toEqual([{ quantity: 1, set: "cmm", collectorNumber: "410" }]);
  });
});

describe("double-faced names", () => {
  it("keys on the front face for both directions", () => {
    expect(collectionKey("Delver of Secrets // Insectile Aberration")).toBe("delver of secrets");
    const c: Collection = { "delver of secrets": [{ quantity: 2, set: "isd", collectorNumber: "51" }] };
    const out = applyTradeToCollection(c, [log({ name: "Delver of Secrets // Insectile Aberration", set: "isd", collectorNumber: "51" })], []);
    expect(out.collection["delver of secrets"]).toEqual([{ quantity: 1, set: "isd", collectorNumber: "51" }]);
    const inn = applyTradeToCollection({}, [], [log({ name: "Delver of Secrets // Insectile Aberration", set: "isd", collectorNumber: "51" })]);
    expect(Object.keys(inn.collection)).toEqual(["delver of secrets"]);
  });
});

describe("mergeLedger", () => {
  const e = (id: string, date: number) => ({ id, date, cardsOut: [], cardsIn: [], cash: { out: 0, in: 0 }, totals: { out: 0, in: 0 } });
  it("skips ids already present, counts what was added, and sorts newest first", () => {
    const r = mergeLedger([e("a", 10)], [e("a", 10), e("b", 30), e("c", 20)]);
    expect(r.added).toBe(2);
    expect(r.merged.map(x => x.id)).toEqual(["b", "c", "a"]);
  });
  it("treats an old backup with no ledger as nothing to add", () => {
    expect(mergeLedger([e("a", 1)], [])).toEqual({ merged: [e("a", 1)], added: 0 });
  });
});
