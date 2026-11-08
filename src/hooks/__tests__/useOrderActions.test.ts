import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOrderActions } from "../useOrderActions";
import type { Collection, CollectionMeta, Order } from "../../types/index";
import { memoryCollectionStore } from "../../test/memoryCollectionStore";

const order = (over: Partial<Order> = {}): Order => ({
  id: "o1",
  createdAt: 1,
  vendor: "Card Kingdom",
  status: "active",
  cards: [
    { deckId: "d1", cardId: "c1", cardName: "Sol Ring", quantity: 1 },
    { deckId: "d1", cardId: "c2", cardName: "Arcane Signet", quantity: 1 },
    { deckId: "d2", cardId: "c3", cardName: "Command Tower", quantity: 1 },
    { cardName: "Freeform Card", quantity: 2 },
  ],
  ...over,
});

function setup(orders: Order[], collection: Collection = {}, meta: CollectionMeta | null = null) {
  const setOrders = vi.fn();
  const dispatch = vi.fn();
  const store = memoryCollectionStore(collection, meta);
  const { result } = renderHook(() => useOrderActions({ orders, setOrders, collectionStore: store, dispatch }));
  return { result, setOrders, store, dispatch };
}

/** Runs the updater passed to a React setState mock against a starting value. */
const applyUpdater = <T,>(fn: ReturnType<typeof vi.fn>, prev: T): T => (fn.mock.calls[0][0] as (p: T) => T)(prev);

describe("useOrderActions", () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-11-04T12:00:00Z")));
  afterEach(() => vi.useRealTimers());

  describe("handleMarkReceived", () => {
    it("marks the order received and leaves other orders alone", () => {
      const other = order({ id: "o2" });
      const { result, setOrders } = setup([order(), other]);
      act(() => result.current.handleMarkReceived("o1"));
      const next = applyUpdater(setOrders, [order(), other]);
      expect(next[0].status).toBe("received");
      expect(next[1].status).toBe("active");
    });

    it("tags deck-linked cards as owned, one dispatch per deck", () => {
      const { result, dispatch } = setup([order()]);
      act(() => result.current.handleMarkReceived("o1"));
      expect(dispatch).toHaveBeenCalledWith({
        type: "BULK_SET_SOURCE",
        payload: { deckId: "d1", cardIds: ["c1", "c2"], source: "owned" },
      });
      expect(dispatch).toHaveBeenCalledWith({
        type: "BULK_SET_SOURCE",
        payload: { deckId: "d2", cardIds: ["c3"], source: "owned" },
      });
    });

    it("merges every order card, freeform included, into the collection", () => {
      const { result, store, dispatch } = setup([order()], { "sol ring": [{ quantity: 1 }] });
      act(() => result.current.handleMarkReceived("o1"));
      const merged = store.get();
      expect(merged["sol ring"]).toEqual([{ quantity: 2 }]);
      expect(merged["freeform card"]).toEqual([{ quantity: 2 }]);
      // Re-tagging follows from the store change (DeckProvider), not a dispatch here.
      expect(dispatch.mock.calls.some(([a]) => a.type === "APPLY_COLLECTION")).toBe(false);
    });

    it("updates the card count on the stored collection meta", () => {
      const stored: CollectionMeta = { fileName: "mine.csv", importedAt: 5, cardCount: 1 };
      const { result, store } = setup([order()], {}, stored);
      act(() => result.current.handleMarkReceived("o1"));
      expect(store.getMeta()).toEqual({ ...stored, cardCount: 4 });
    });

    it("creates collection meta when none exists", () => {
      const { result, store } = setup([order()]);
      act(() => result.current.handleMarkReceived("o1"));
      expect(store.getMeta()).toEqual({ fileName: "Order receipt", importedAt: Date.now(), cardCount: 4 });
    });

    it.each(["received", "cancelled"] as const)("does nothing for a %s order", status => {
      const { result, setOrders, store, dispatch } = setup([order({ status })]);
      act(() => result.current.handleMarkReceived("o1"));
      expect(setOrders).not.toHaveBeenCalled();
      expect(store.get()).toEqual({});
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("does nothing for an unknown order id", () => {
      const { result, setOrders, store, dispatch } = setup([order()]);
      act(() => result.current.handleMarkReceived("missing"));
      expect(setOrders).not.toHaveBeenCalled();
      expect(store.get()).toEqual({});
      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  describe("handleMarkCancelled", () => {
    it("marks the order cancelled", () => {
      const { result, setOrders } = setup([order()]);
      act(() => result.current.handleMarkCancelled("o1"));
      expect(applyUpdater(setOrders, [order()])[0].status).toBe("cancelled");
    });

    it("sends the order's deck-linked lines and the current Collection to the reducer", () => {
      const { result, dispatch, store } = setup([order()], { "sol ring": [{ quantity: 1 }] });
      const before = store.getSnapshot();
      act(() => result.current.handleMarkCancelled("o1"));
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith({
        type: "CANCEL_ORDER_LINES",
        payload: {
          orderId: "o1",
          orderLabel: "Card Kingdom",
          linesByDeck: { d1: ["c1", "c2"], d2: ["c3"] },
          collection: { "sol ring": [{ quantity: 1 }] },
          createdAt: Date.now(),
        },
      });
      expect(store.getSnapshot()).toBe(before);
    });

    it("labels the order with vendor and date", () => {
      const { result, dispatch } = setup([order({ orderDate: new Date("2026-10-15T12:00:00Z").getTime() })]);
      act(() => result.current.handleMarkCancelled("o1"));
      expect(dispatch.mock.calls[0][0].payload.orderLabel).toBe("Card Kingdom — October 15");
    });

    it("dispatches no deck actions for an order with only freeform cards", () => {
      const { result, dispatch } = setup([order({ cards: [{ cardName: "X", quantity: 1 }] })]);
      act(() => result.current.handleMarkCancelled("o1"));
      expect(dispatch).not.toHaveBeenCalled();
    });

    it.each(["received", "cancelled"] as const)("does nothing for a %s order", status => {
      const { result, setOrders, dispatch } = setup([order({ status })], { "sol ring": [{ quantity: 1 }] });
      act(() => result.current.handleMarkCancelled("o1"));
      expect(setOrders).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("does nothing for an unknown order id", () => {
      const { result, setOrders, dispatch } = setup([order()]);
      act(() => result.current.handleMarkCancelled("missing"));
      expect(setOrders).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();
    });
  });
});
