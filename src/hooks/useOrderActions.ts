import type { Dispatch, SetStateAction } from "react";
import type { Collection, CollectionMeta, DeckNotification, Order } from "../types/index";
import type { DeckAction } from "../store/decks";
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
  collection: Collection;
  setCollection: Dispatch<SetStateAction<Collection>>;
  setCollectionMeta: Dispatch<SetStateAction<CollectionMeta | null>>;
  dispatch: Dispatch<DeckAction>;
}

/** Receive and cancel handlers for orders. Both touch orders, deck card sources and the collection. */
export function useOrderActions({
  orders,
  setOrders,
  collection,
  setCollection,
  setCollectionMeta,
  dispatch,
}: OrderActionsDeps) {
  function handleMarkReceived(orderId: string) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    // Update order status
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "received" as const } : o));

    // Tag deck-linked cards as "owned" (manuallyTagged so collection won't overwrite)
    for (const [deckId, cardIds] of cardsByDeckFor(order)) {
      dispatch({ type: "BULK_SET_SOURCE", payload: { deckId, cardIds, source: "owned" } });
    }

    // Merge into collection (Option A: quantity only, no set/CN)
    const updatedCollection = mergeOrderCardsIntoCollection(order.cards, collection);
    setCollection(updatedCollection);
    setCollectionMeta(prev => prev
      ? { ...prev, cardCount: Object.keys(updatedCollection).length }
      : { fileName: "Order receipt", importedAt: Date.now(), cardCount: Object.keys(updatedCollection).length }
    );
    dispatch({ type: "APPLY_COLLECTION", payload: updatedCollection });
  }

  function handleMarkCancelled(orderId: string) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    // Update order status
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "cancelled" as const } : o));

    // Unset source + manuallyTagged on deck-linked cards so collection can re-tag
    const cardsByDeck = cardsByDeckFor(order);
    for (const [deckId, cardIds] of cardsByDeck) {
      dispatch({ type: "UNSET_CARD_SOURCES", payload: { deckId, cardIds } });
    }

    // Re-apply collection now that manuallyTagged is cleared
    if (Object.keys(collection).length > 0) {
      dispatch({ type: "APPLY_COLLECTION", payload: collection });
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
