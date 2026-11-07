import type { TradeLogEntry } from "./trade";
export type AcquisitionSource =
  | "owned"
  | "ordered"
  | "proxy"
  | "in_another_deck"
  | "need_to_buy"
  | "borrowed"
  | "in_binder"
  | "in_storage";

export const ACQUISITION_SOURCES: { value: AcquisitionSource; label: string }[] = [
  { value: "owned",           label: "Owned" },
  { value: "ordered",         label: "Ordered" },
  { value: "proxy",           label: "Proxy" },
  { value: "in_another_deck", label: "In another deck" },
  { value: "need_to_buy",     label: "Need to buy" },
  { value: "borrowed",        label: "Borrowed" },
  { value: "in_binder",       label: "In binder" },
  { value: "in_storage",      label: "In storage" },
];

export interface Card {
  id: string;
  name: string;
  inputName?: string;
  quantity: number;
  acquired: boolean;
  color: string[];
  type: string;
  source?: AcquisitionSource;
  set?: string;
  rarity?: "common" | "uncommon" | "rare" | "mythic" | "special" | "bonus";
  manuallyTagged?: boolean;
  price?: number; // unit price in USD from Scryfall; undefined = unpriced
}

export interface CollectionPrinting {
  quantity: number;
  set?: string;
  collectorNumber?: string;
  foil?: boolean;
}

// Collection: lowercased card name → list of printings (one entry per set/printing/foil combo)
export type Collection = Record<string, CollectionPrinting[]>;

export interface CollectionMeta {
  fileName: string;
  importedAt: number;
  cardCount: number;
}

export interface DeckNotification {
  id: string;
  type: "order_cancelled";
  orderId: string;
  orderLabel: string;
  affectedCardIds: string[];
  createdAt: number;
}

export interface DeckToken {
  name: string;
  typeLine: string;
  createdBy: string[];
}

export interface DeckAltPrinting {
  cardName: string;
  setCode: string;
  altName: string;
}

export interface DeckExtraInfo {
  tokens: DeckToken[];
  altPrintings: DeckAltPrinting[];
  enrichedAt: number;
}

export interface Deck {
  id: string;
  name: string;
  url?: string;
  format?: string;
  cards: Card[];
  createdAt: number;
  isBuilt?: boolean;
  notifications?: DeckNotification[];
  extraInfo?: DeckExtraInfo;
  pricesUpdatedAt?: number;
  /** Up to 2 IDs of cards in `cards` designated as commander(s). */
  commanderIds?: string[];
  /** True once the user dismissed the "no commander set" nudge for this deck. */
  commanderPromptDismissed?: boolean;
}

export interface ErrorQueueItem {
  originalName: string;
  searchName: string;
  resolved: boolean;
}

// ── Orders ────────────────────────────────────────────────────────────────────

export type Carrier = "ups" | "usps" | "fedex" | "dhl" | "other";
export type OrderStatus = "active" | "received" | "cancelled";

export interface OrderCard {
  deckId?: string;   // undefined = freeform card not tied to any deck
  cardId?: string;   // undefined = freeform card not tied to any deck
  cardName: string;  // denormalized for display without deck lookup
  quantity: number;
  price?: number;    // unit price in USD; undefined = not entered
}

export interface Order {
  id: string;
  createdAt: number;
  vendor: string;
  trackingNumber?: string;
  carrier?: Carrier;
  orderDate?: number;
  expectedArrival?: number;
  notes?: string;
  status: OrderStatus;
  cards: OrderCard[];
}

// ── Backup file envelope ───────────────────────────────────────────────────

export interface Backup {
  version: 1;
  exportedAt: string;              // ISO 8601
  decks: Deck[];
  errors: Record<string, ErrorQueueItem[]>;
  collection: Collection;
  collectionMeta: CollectionMeta | null;
  orders: Order[];
  vendorHistory: string[];
  /** Optional: absent in backups made before Transactions. Envelope stays version 1. */
  tradeLedger?: TradeLogEntry[];
  binderExcluded?: string[];
}

/** What a backup import added; drives the summary toast. */
export interface ImportCounts {
  newDecks: number;
  newCards: number;
  newOrders: number;
  newTrades?: number;
}
