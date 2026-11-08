import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOrders } from "../useOrders";
import { ORDERS_KEY, VENDOR_HISTORY_KEY } from "../../../store/storageKeys";
import type { Collection, CollectionMeta, Order } from "../../../types/index";
import { memoryCollectionStore } from "../../../test/memoryCollectionStore";

let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v), removeItem: (k: string) => void storage.delete(k), clear: () => storage.clear() },
    writable: true, configurable: true,
  });
  vi.useFakeTimers().setSystemTime(new Date("2026-11-04T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

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

function setup(orders: Order[] = [], collection: Collection = {}, meta: CollectionMeta | null = null) {
  storage.set(ORDERS_KEY, JSON.stringify(orders));
  const dispatch = vi.fn();
  const store = memoryCollectionStore(collection, meta);
  const { result } = renderHook(() => useOrders({ collectionStore: store, dispatch }));
  return { result, store, dispatch };
}

const savedOrders = (): Order[] => JSON.parse(storage.get(ORDERS_KEY)!);

describe("useOrders", () => {
  describe("create, update and remove", () => {
    it("adds a new order first and saves it", () => {
      const { result } = setup([order()]);
      act(() => result.current.create(order({ id: "o2" })));
      expect(result.current.orders.map(o => o.id)).toEqual(["o2", "o1"]);
      expect(savedOrders().map(o => o.id)).toEqual(["o2", "o1"]);
    });

    it("replaces an updated order", () => {
      const { result } = setup([order()]);
      act(() => result.current.update(order({ vendor: "TCGplayer" })));
      expect(result.current.orders[0].vendor).toBe("TCGplayer");
    });

    it("removes an order and touches nothing else", () => {
      const { result, store, dispatch } = setup([order()], { "sol ring": [{ quantity: 1 }] });
      const before = store.getSnapshot();
      act(() => result.current.remove("o1"));
      expect(result.current.orders).toEqual([]);
      expect(dispatch).not.toHaveBeenCalled();
      expect(store.getSnapshot()).toBe(before);
    });

    it("records a new order's vendor in the recent-vendor list", () => {
      const { result } = setup();
      act(() => result.current.create(order({ vendor: "Card Kingdom" })));
      act(() => result.current.create(order({ id: "o2", vendor: "TCGplayer" })));
      expect(result.current.recentVendors).toEqual(["TCGplayer", "Card Kingdom"]);
      expect(JSON.parse(storage.get(VENDOR_HISTORY_KEY)!)).toEqual(["TCGplayer", "Card Kingdom"]);
    });

    it("counts active orders", () => {
      const { result } = setup([order(), order({ id: "o2", status: "received" }), order({ id: "o3" })]);
      expect(result.current.activeCount).toBe(2);
    });
  });

  describe("receive", () => {
    it("marks the order received and leaves other orders alone", () => {
      const { result } = setup([order(), order({ id: "o2" })]);
      act(() => result.current.receive("o1"));
      expect(result.current.orders.map(o => o.status)).toEqual(["received", "active"]);
    });

    it("tags deck-linked cards as owned, one dispatch per deck", () => {
      const { result, dispatch } = setup([order()]);
      act(() => result.current.receive("o1"));
      expect(dispatch).toHaveBeenCalledWith({ type: "BULK_SET_SOURCE", payload: { deckId: "d1", cardIds: ["c1", "c2"], source: "owned" } });
      expect(dispatch).toHaveBeenCalledWith({ type: "BULK_SET_SOURCE", payload: { deckId: "d2", cardIds: ["c3"], source: "owned" } });
    });

    it("merges every line, freeform included, into the Collection", () => {
      const { result, store, dispatch } = setup([order()], { "sol ring": [{ quantity: 1 }] });
      act(() => result.current.receive("o1"));
      expect(store.get()["sol ring"]).toEqual([{ quantity: 2 }]);
      expect(store.get()["freeform card"]).toEqual([{ quantity: 2 }]);
      // Re-tagging follows from the store change (DeckProvider), not a dispatch here.
      expect(dispatch.mock.calls.some(([a]) => a.type === "APPLY_COLLECTION")).toBe(false);
    });

    it("updates the card count on the stored Collection meta", () => {
      const stored: CollectionMeta = { fileName: "mine.csv", importedAt: 5, cardCount: 1 };
      const { result, store } = setup([order()], {}, stored);
      act(() => result.current.receive("o1"));
      expect(store.getMeta()).toEqual({ ...stored, cardCount: 4 });
    });

    it("creates Collection meta when none exists", () => {
      const { result, store } = setup([order()]);
      act(() => result.current.receive("o1"));
      expect(store.getMeta()).toEqual({ fileName: "Order receipt", importedAt: Date.now(), cardCount: 4 });
    });

    it("applies once when called twice before a re-render", () => {
      const { result, store } = setup([order()]);
      const { receive } = result.current;
      act(() => { receive("o1"); receive("o1"); });
      expect(store.get()["sol ring"]).toEqual([{ quantity: 1 }]);
    });

    it.each(["received", "cancelled"] as const)("does nothing for a %s order", status => {
      const { result, store, dispatch } = setup([order({ status })]);
      act(() => result.current.receive("o1"));
      expect(result.current.orders[0].status).toBe(status);
      expect(store.get()).toEqual({});
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("does nothing for an unknown order id", () => {
      const { result, store, dispatch } = setup([order()]);
      act(() => result.current.receive("missing"));
      expect(result.current.orders[0].status).toBe("active");
      expect(store.get()).toEqual({});
      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  describe("cancel", () => {
    it("marks the order cancelled", () => {
      const { result } = setup([order()]);
      act(() => result.current.cancel("o1"));
      expect(result.current.orders[0].status).toBe("cancelled");
    });

    it("sends the deck-linked lines and the current Collection to the reducer", () => {
      const { result, dispatch, store } = setup([order({ orderDate: new Date("2026-10-15T12:00:00Z").getTime() })], { "sol ring": [{ quantity: 1 }] });
      const before = store.getSnapshot();
      act(() => result.current.cancel("o1"));
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith({
        type: "CANCEL_ORDER_LINES",
        payload: {
          orderId: "o1",
          orderLabel: "Card Kingdom — October 15",
          linesByDeck: { d1: ["c1", "c2"], d2: ["c3"] },
          collection: { "sol ring": [{ quantity: 1 }] },
          createdAt: Date.now(),
        },
      });
      expect(store.getSnapshot()).toBe(before);
    });

    it("dispatches nothing for an order with only freeform lines", () => {
      const { result, dispatch } = setup([order({ cards: [{ cardName: "X", quantity: 1 }] })]);
      act(() => result.current.cancel("o1"));
      expect(result.current.orders[0].status).toBe("cancelled");
      expect(dispatch).not.toHaveBeenCalled();
    });

    it.each(["received", "cancelled"] as const)("does nothing for a %s order", status => {
      const { result, dispatch } = setup([order({ status })]);
      act(() => result.current.cancel("o1"));
      expect(result.current.orders[0].status).toBe(status);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("does nothing for an unknown order id", () => {
      const { result, dispatch } = setup([order()]);
      act(() => result.current.cancel("missing"));
      expect(dispatch).not.toHaveBeenCalled();
    });
  });
});
