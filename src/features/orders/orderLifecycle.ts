// Rules for an Order's life (GLOSSARY: Order, Receiving, Cancelling). Pure: useOrders applies them.
import type { Order, OrderStatus } from "../../types/index";

const RECENT_VENDOR_LIMIT = 6;

/** Only an Active Order can be received or cancelled. Received and Cancelled are final. */
export function isActive(order: Order): boolean {
  return order.status === "active";
}

/** The orders with one Order moved to a final status. */
export function withStatus(orders: Order[], orderId: string, status: Exclude<OrderStatus, "active">): Order[] {
  return orders.map(o => o.id === orderId ? { ...o, status } : o);
}

/** Deck-linked lines of an Order, as card ids grouped by deck id. Freeform lines are skipped. */
export function cardIdsByDeck(order: Order): Record<string, string[]> {
  const byDeck: Record<string, string[]> = {};
  for (const line of order.cards) {
    if (line.deckId && line.cardId) (byDeck[line.deckId] ??= []).push(line.cardId);
  }
  return byDeck;
}

/** How a deck's cancellation notice names the Order: vendor, plus the order date when known. */
export function orderLabel(order: Order): string {
  const d = order.orderDate
    ? new Date(order.orderDate).toLocaleDateString("en-US", { month: "long", day: "numeric" })
    : "";
  return d ? `${order.vendor} — ${d}` : order.vendor;
}

/** Recent vendors, newest first, without case-insensitive duplicates. */
export function withRecentVendor(recent: string[], vendor: string): string[] {
  const next = [vendor, ...recent.filter(v => v.toLowerCase() !== vendor.toLowerCase())];
  return next.slice(0, RECENT_VENDOR_LIMIT);
}
