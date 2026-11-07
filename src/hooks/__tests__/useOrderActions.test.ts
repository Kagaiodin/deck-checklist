import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOrderActions } from "../useOrderActions";
import type { Collection, CollectionMeta, Order } from "../../types/index";

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
  const setCollection = vi.fn();
  const setCollectionMeta = vi.fn();
  const dispatch = vi.fn();
  const { result } = renderHook(() =>
    useOrderActions({ orders, setOrders, readCollection: () => collection, readCollectionMeta: () => meta, setCollection, setCollectionMeta, dispatch }),
  );
  return { result, setOrders, setCollection, setCollectionMeta, dispatch };
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

    it("merges every order card, freeform included, into the collection and re-applies it", () => {
      const { result, setCollection, dispatch } = setup([order()], { "sol ring": [{ quantity: 1 }] });
      act(() => result.current.handleMarkReceived("o1"));
      const merged = setCollection.mock.calls[0][0] as Collection;
      expect(merged["sol ring"]).toEqual([{ quantity: 2 }]);
      expect(merged["freeform card"]).toEqual([{ quantity: 2 }]);
      expect(dispatch).toHaveBeenLastCalledWith({ type: "APPLY_COLLECTION", payload: merged });
    });

    it("updates the card count on the stored collection meta", () => {
      const stored: CollectionMeta = { fileName: "mine.csv", importedAt: 5, cardCount: 1 };
      const { result, setCollection, setCollectionMeta } = setup([order()], {}, stored);
      act(() => result.current.handleMarkReceived("o1"));
      const merged = setCollection.mock.calls[0][0] as Collection;
      expect(setCollectionMeta).toHaveBeenCalledWith({ ...stored, cardCount: Object.keys(merged).length });
    });

    it("creates collection meta when none exists", () => {
      const { result, setCollectionMeta } = setup([order()]);
      act(() => result.current.handleMarkReceived("o1"));
      const meta = setCollectionMeta.mock.calls[0][0] as CollectionMeta;
      expect(meta.fileName).toBe("Order receipt");
      expect(meta.cardCount).toBe(4);
    });

    it("does nothing for an unknown order id", () => {
      const { result, setOrders, setCollection, dispatch } = setup([order()]);
      act(() => result.current.handleMarkReceived("missing"));
      expect(setOrders).not.toHaveBeenCalled();
      expect(setCollection).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  describe("handleMarkCancelled", () => {
    it("marks the order cancelled", () => {
      const { result, setOrders } = setup([order()]);
      act(() => result.current.handleMarkCancelled("o1"));
      expect(applyUpdater(setOrders, [order()])[0].status).toBe("cancelled");
    });

    it("unsets card sources per deck and does not touch the collection store", () => {
      const { result, dispatch, setCollection } = setup([order()]);
      act(() => result.current.handleMarkCancelled("o1"));
      expect(dispatch).toHaveBeenCalledWith({ type: "UNSET_CARD_SOURCES", payload: { deckId: "d1", cardIds: ["c1", "c2"] } });
      expect(dispatch).toHaveBeenCalledWith({ type: "UNSET_CARD_SOURCES", payload: { deckId: "d2", cardIds: ["c3"] } });
      expect(setCollection).not.toHaveBeenCalled();
    });

    it("re-applies the collection only when it is non-empty", () => {
      const withCollection = setup([order()], { "sol ring": [{ quantity: 1 }] });
      act(() => withCollection.result.current.handleMarkCancelled("o1"));
      expect(withCollection.dispatch).toHaveBeenCalledWith({
        type: "APPLY_COLLECTION",
        payload: { "sol ring": [{ quantity: 1 }] },
      });

      const empty = setup([order()]);
      act(() => empty.result.current.handleMarkCancelled("o1"));
      expect(empty.dispatch.mock.calls.some(([a]) => a.type === "APPLY_COLLECTION")).toBe(false);
    });

    it("adds one notification per affected deck, labelled with vendor and date", () => {
      const { result, dispatch } = setup([order({ orderDate: new Date("2026-10-15T12:00:00Z").getTime() })]);
      act(() => result.current.handleMarkCancelled("o1"));
      const notes = dispatch.mock.calls.map(([a]) => a).filter(a => a.type === "ADD_NOTIFICATION");
      expect(notes).toHaveLength(2);
      expect(notes[0].payload).toEqual({
        deckId: "d1",
        notification: {
          id: "o1_d1",
          type: "order_cancelled",
          orderId: "o1",
          orderLabel: "Card Kingdom — October 15",
          affectedCardIds: ["c1", "c2"],
          createdAt: Date.now(),
        },
      });
    });

    it("labels with the vendor alone when the order has no date", () => {
      const { result, dispatch } = setup([order()]);
      act(() => result.current.handleMarkCancelled("o1"));
      const note = dispatch.mock.calls.map(([a]) => a).find(a => a.type === "ADD_NOTIFICATION")!;
      expect(note.payload.notification.orderLabel).toBe("Card Kingdom");
    });

    it("dispatches no deck actions for an order with only freeform cards", () => {
      const { result, dispatch } = setup([order({ cards: [{ cardName: "X", quantity: 1 }] })]);
      act(() => result.current.handleMarkCancelled("o1"));
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
