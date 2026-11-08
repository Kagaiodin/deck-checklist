import { describe, it, expect } from "vitest";
import { canSettle, linesByDeck, orderLabel, withRecentVendor, withStatus } from "../orderLifecycle";
import type { Order } from "../../../types/index";

const order = (over: Partial<Order> = {}): Order => ({
  id: "o1", createdAt: 1, vendor: "Card Kingdom", status: "active", cards: [], ...over,
});

describe("canSettle", () => {
  it("allows only an active order to be received or cancelled", () => {
    expect(canSettle(order())).toBe(true);
    expect(canSettle(order({ status: "received" }))).toBe(false);
    expect(canSettle(order({ status: "cancelled" }))).toBe(false);
  });
});

describe("withStatus", () => {
  it("moves one order to the status and leaves the others alone", () => {
    const next = withStatus([order(), order({ id: "o2" })], "o1", "received");
    expect(next.map(o => o.status)).toEqual(["received", "active"]);
  });
});

describe("linesByDeck", () => {
  it("groups deck-linked lines by deck and skips freeform lines", () => {
    const o = order({
      cards: [
        { deckId: "d1", cardId: "c1", cardName: "Sol Ring", quantity: 1 },
        { deckId: "d2", cardId: "c3", cardName: "Command Tower", quantity: 1 },
        { deckId: "d1", cardId: "c2", cardName: "Arcane Signet", quantity: 1 },
        { cardName: "Freeform Card", quantity: 2 },
      ],
    });
    expect(linesByDeck(o)).toEqual({ d1: ["c1", "c2"], d2: ["c3"] });
  });

  it("is empty for an order with only freeform lines", () => {
    expect(linesByDeck(order({ cards: [{ cardName: "X", quantity: 1 }] }))).toEqual({});
  });
});

describe("orderLabel", () => {
  it("names the vendor and order date", () => {
    expect(orderLabel(order({ orderDate: new Date("2026-10-15T12:00:00Z").getTime() }))).toBe("Card Kingdom — October 15");
  });

  it("names the vendor alone when the order has no date", () => {
    expect(orderLabel(order())).toBe("Card Kingdom");
  });
});

describe("withRecentVendor", () => {
  it("puts the vendor first and drops a case-insensitive duplicate", () => {
    expect(withRecentVendor(["TCGplayer", "card kingdom"], "Card Kingdom")).toEqual(["Card Kingdom", "TCGplayer"]);
  });

  it("keeps at most six vendors", () => {
    expect(withRecentVendor(["a", "b", "c", "d", "e", "f"], "g")).toEqual(["g", "a", "b", "c", "d", "e"]);
  });
});
