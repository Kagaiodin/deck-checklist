import type { Dispatch, SetStateAction } from "react";
import type { DeckNotification, Order } from "../types/index";
import type { DeckAction } from "../store/decks";
import type { CollectionStore } from "../store/collection";
import { mergeOrderCardsIntoCollection } from "../utils/csvParser";

function orderLabelForNotification(order: Order): string {
  const d = order.orderDate
    ? new Date(order.orderDate).toLocaleDateString("en-US", { month: "long", day: "numeric" })
    : "";
  return d ? `${order.vendor} — ${d}` : order.vendor;
}

/** Deck-linked cards on an order, grouped by deck. Freeform cards are skipped. */
function cardsByDeckFor(order: Order): Map<string, string[]> {
  const byDeck = new Map<string, string[]>();
  for (const oc of order.cards) {
    if (oc.deckId && oc.cardId) {
      byDeck.set(oc.deckId, [...(byDeck.get(oc.deckId) ?? []), oc.cardId]);
    }
  }
  return byDeck;
}

interface OrderActionsDeps {
  orders: Order[];
  setOrders: Dispatch<SetStateAction<Order[]>>;
  collectionStore: CollectionStore;
  dispatch: Dispatch<DeckAction>;
}

/** Receive and cancel handlers for orders. Both touch orders, deck card sources and the collection. */
export function useOrderActions({
  orders,
  setOrders,
  collectionStore,
  dispatch,
}: OrderActionsDeps) {
  function handleMarkReceived(orderId: string) {
    const order = orders.find(o => o.id === orderId);
    if (!order || order.status !== "active") return;

    // Update order status
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "received" as const } : o));

    // Tag deck-linked cards as "owned" (manuallyTagged so collection won't overwrite)
    for (const [deckId, cardIds] of cardsByDeckFor(order)) {
      dispatch({ type: "BULK_SET_SOURCE", payload: { deckId, cardIds, source: "owned" } });
    }

    // Merge into collection (Option A: quantity only, no set/CN)
    // DeckProvider re-tags decks from the change.
    collectionStore.update(c => mergeOrderCardsIntoCollection(order.cards, c), { source: "Order receipt" });
  }

  function handleMarkCancelled(orderId: string) {
    const order = orders.find(o => o.id === orderId);
    if (!order || order.status !== "active") return;

    // Update order status
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "cancelled" as const } : o));

    // Unset source + manuallyTagged on deck-linked cards so collection can re-tag
    const cardsByDeck = cardsByDeckFor(order);
    for (const [deckId, cardIds] of cardsByDeck) {
      dispatch({ type: "UNSET_CARD_SOURCES", payload: { deckId, cardIds } });
    }

    // Re-apply collection now that manuallyTagged is cleared (the Collection itself didn't change)
    const current = collectionStore.get();
    if (Object.keys(current).length > 0) {
      dispatch({ type: "APPLY_COLLECTION", payload: current });
    }

    // Add deck notifications so user knows which cards to review
    const label = orderLabelForNotification(order);
    for (const [deckId, cardIds] of cardsByDeck) {
      const notification: DeckNotification = {
        id: `${orderId}_${deckId}`,
        type: "order_cancelled",
        orderId,
        orderLabel: label,
        affectedCardIds: cardIds,
        createdAt: Date.now(),
      };
      dispatch({ type: "ADD_NOTIFICATION", payload: { deckId, notification } });
    }
  }

  return { handleMarkReceived, handleMarkCancelled };
}
