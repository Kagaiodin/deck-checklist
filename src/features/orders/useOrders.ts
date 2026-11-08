import { useCallback, useRef } from "react";
import type { Dispatch } from "react";
import type { Order } from "../../types/index";
import type { DeckAction } from "../../store/decks";
import type { CollectionStore } from "../../store/collection";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { ORDERS_KEY, VENDOR_HISTORY_KEY } from "../../store/storageKeys";
import { mergeOrderCardsIntoCollection } from "../../utils/csvParser";
import { canSettle, linesByDeck, orderLabel, withRecentVendor, withStatus } from "./orderLifecycle";

interface OrdersDeps {
  collectionStore: CollectionStore;
  dispatch: Dispatch<DeckAction>;
}

/**
 * The Orders (newest first) and the recent-vendor list. The only writer of both, and the only path
 * by which an Order changes the Collection or deck tags.
 */
export function useOrders({ collectionStore, dispatch }: OrdersDeps) {
  const [orders, setOrders] = useLocalStorage<Order[]>(ORDERS_KEY, []);
  const [recentVendors, setRecentVendors] = useLocalStorage<string[]>(VENDOR_HISTORY_KEY, []);

  // Handlers read the latest orders from here, not the render-time value (CODING_STANDARDS: readers).
  const latest = useRef(orders);
  const commit = useCallback((change: (prev: Order[]) => Order[]) => {
    latest.current = change(latest.current);
    setOrders(latest.current);
  }, [setOrders]);

  /** Adds the Order, from the buy flow or the New Order sheet, and records its vendor. */
  const create = useCallback((order: Order) => {
    commit(prev => [order, ...prev]);
    setRecentVendors(prev => withRecentVendor(prev, order.vendor));
  }, [commit, setRecentVendors]);

  /** Replaces the Order. A received Order's edited lines don't change the Collection. */
  const update = useCallback(
    (updated: Order) => commit(prev => prev.map(o => o.id === updated.id ? updated : o)),
    [commit],
  );

  /** Removes the Order only. Deck tags and the Collection stay as they are. */
  const remove = useCallback((id: string) => commit(prev => prev.filter(o => o.id !== id)), [commit]);

  /** Receiving: linked deck cards become owned, and every line's quantity joins the Collection. */
  const receive = useCallback((id: string) => {
    const order = latest.current.find(o => o.id === id);
    if (!order || !canSettle(order)) return;
    commit(prev => withStatus(prev, id, "received"));
    for (const [deckId, cardIds] of Object.entries(linesByDeck(order))) {
      dispatch({ type: "BULK_SET_SOURCE", payload: { deckId, cardIds, source: "owned" } });
    }
    // Quantity only, no set/CN. DeckProvider re-tags decks from the change.
    collectionStore.update(c => mergeOrderCardsIntoCollection(order.cards, c), { source: "Order receipt" });
  }, [collectionStore, commit, dispatch]);

  /** Cancelling: the reducer clears linked cards still tagged "ordered" and notifies their decks. */
  const cancel = useCallback((id: string) => {
    const order = latest.current.find(o => o.id === id);
    if (!order || !canSettle(order)) return;
    commit(prev => withStatus(prev, id, "cancelled"));
    const lines = linesByDeck(order);
    if (Object.keys(lines).length === 0) return;
    dispatch({
      type: "CANCEL_ORDER_LINES",
      payload: {
        orderId: id,
        orderLabel: orderLabel(order),
        linesByDeck: lines,
        collection: collectionStore.get(),
        createdAt: Date.now(),
      },
    });
  }, [collectionStore, commit, dispatch]);

  const activeCount = orders.filter(o => o.status === "active").length;

  return { orders, recentVendors, activeCount, create, update, remove, receive, cancel };
}
