import type { AcquisitionSource, Card, Deck, Collection, DeckNotification, DeckExtraInfo, ErrorQueueItem } from "../types/index";
import { applyCollectionToCards } from "../utils/csvParser";
import { useReducer, createContext, useContext, createElement, useEffect, useLayoutEffect } from "react";
import { collectionStore } from "./collection";
import { DECKS_KEY, ERRORS_KEY } from "./storageKeys";
import type { Dispatch, ReactNode } from "react";

/** Each deck's Deck errors, by deck id. Kept beside the decks so a deck and its errors change together. */
export type DeckErrors = Record<string, ErrorQueueItem[]>;

export type DeckState = {
  decks: Deck[];
  errors: DeckErrors;
};

export type DeckAction =
  | { type: "ADD_DECK"; payload: Deck; errors?: ErrorQueueItem[] }
  | { type: "DELETE_DECK"; payload: string }
  | { type: "RENAME_DECK"; payload: { id: string; name: string } }
  | { type: "SET_DECK_FORMAT"; payload: { id: string; format: string | undefined } }
  | { type: "SET_CARDS"; payload: { deckId: string; cards: Deck["cards"] } }
  | { type: "TOGGLE_ACQUIRED"; payload: { deckId: string; cardId: string } }
  | { type: "SET_CARD_SOURCE"; payload: { deckId: string; cardId: string; source: import("../types/index").AcquisitionSource | undefined } }
  | { type: "BULK_SET_SOURCE"; payload: { deckId: string; cardIds: string[]; source: import("../types/index").AcquisitionSource | undefined } }
  | { type: "REMOVE_CARD"; payload: { deckId: string; cardId: string } }
  | { type: "UPDATE_CARD_QUANTITY"; payload: { deckId: string; cardId: string; quantity: number } }
  | { type: "ADD_CARD"; payload: { deckId: string; card: import("../types/index").Card } }
  | { type: "APPLY_COLLECTION"; payload: Collection }
  | { type: "CANCEL_ORDER_LINES"; payload: CancelOrderLines }
  | { type: "DISMISS_NOTIFICATION"; payload: { deckId: string; notificationId: string } }
  | { type: "SET_DECKS"; payload: Deck[] }
  | { type: "SET_EXTRA_INFO"; payload: { deckId: string; extraInfo: DeckExtraInfo } }
  | { type: "SET_DECK_PRICES"; payload: { deckId: string; prices: Record<string, number | null>; updatedAt?: number } }
  | { type: "SET_DECK_BUILT"; payload: { deckId: string; built: boolean; collection: Collection } }
  | { type: "TOGGLE_COMMANDER"; payload: { deckId: string; cardId: string } }
  | { type: "DISMISS_COMMANDER_PROMPT"; payload: { deckId: string } }
  | { type: "REMAP_DECK_ERROR"; payload: { deckId: string; originalName: string; searchName: string; card?: Card } }
  | { type: "DISMISS_DECK_ERROR"; payload: { deckId: string; originalName: string } };

/** An Order being cancelled: the card ids of its deck-linked lines, grouped by deck (GLOSSARY: Cancelling). */
export interface CancelOrderLines {
  orderId: string;
  orderLabel: string;
  cardIdsByDeck: Record<string, string[]>;
  collection: Collection;
  createdAt: number;
}

export const MAX_COMMANDERS = 2;

/**
 * Cancelling an Order: linked cards still tagged "ordered" lose the tag and are re-tagged from the
 * Collection. Cards the user re-tagged since are left alone. The deck is told which cards to review.
 */
function cancelOrderLines(deck: Deck, cardIds: string[], p: CancelOrderLines): Deck {
  const cleared = deck.cards.filter(c => cardIds.includes(c.id) && c.source === "ordered").map(c => c.id);
  if (cleared.length === 0) return deck;
  const reset = deck.cards.map(c => cleared.includes(c.id) ? { ...c, source: undefined, manuallyTagged: false } : c);
  const notification: DeckNotification = {
    id: `${p.orderId}_${deck.id}`,
    type: "order_cancelled",
    orderId: p.orderId,
    orderLabel: p.orderLabel,
    affectedCardIds: cleared,
    createdAt: p.createdAt,
  };
  return {
    ...deck,
    cards: applyCollectionToCards(reset, p.collection),
    notifications: [...(deck.notifications ?? []), notification],
  };
}

/** Sources a Built deck keeps: a proxy the user tagged, and a borrowed card (it isn't the user's). */
function keptWhenBuilt(c: Card): AcquisitionSource | undefined {
  if (c.source === "borrowed") return "borrowed";
  if (c.manuallyTagged && c.source === "proxy") return "proxy";
  return undefined;
}

/** A Built deck's cards: every card acquired, and owned unless it is a proxy or borrowed (GLOSSARY: Built). */
function builtCards(cards: Card[]): Card[] {
  return cards.map(c => ({ ...c, acquired: true, source: keptWhenBuilt(c) ?? "owned", manuallyTagged: true }));
}

/** Unmarking Built: clear every checkbox and tag, then re-tag from the Collection. */
/** Applies `change` to one of a deck's errors. */
function updateError(errors: DeckErrors, deckId: string, originalName: string, change: Partial<ErrorQueueItem>): DeckErrors {
  const queue = errors[deckId];
  if (!queue) return errors;
  return { ...errors, [deckId]: queue.map(e => e.originalName === originalName ? { ...e, ...change } : e) };
}

function unbuiltCards(cards: Card[], collection: Collection): Card[] {
  const reset = cards.map(c => ({ ...c, acquired: false, source: undefined, manuallyTagged: false }));
  return applyCollectionToCards(reset, collection);
}

// Exported for unit testing
export function deckReducer(state: DeckState, action: DeckAction): DeckState {
  switch (action.type) {
    case "ADD_DECK": {
      const deck = action.payload;
      const name = deck.name.trim() || `Deck ${state.decks.length + 1}`;
      const cards = deck.isBuilt ? builtCards(deck.cards) : deck.cards;
      const errors = action.errors ? { ...state.errors, [deck.id]: action.errors } : state.errors;
      return { ...state, decks: [...state.decks, { ...deck, name, cards }], errors };
    }
    case "DELETE_DECK": {
      const errors = { ...state.errors };
      delete errors[action.payload];
      return { ...state, decks: state.decks.filter(d => d.id !== action.payload), errors };
    }
    case "RENAME_DECK":
      return {
        ...state,
        decks: state.decks.map(d =>
          d.id === action.payload.id ? { ...d, name: action.payload.name } : d
        )
      };
    case "SET_DECK_FORMAT":
      return {
        ...state,
        decks: state.decks.map(d =>
          d.id === action.payload.id ? { ...d, format: action.payload.format } : d
        )
      };
    case "SET_CARDS":
      return {
        ...state,
        decks: state.decks.map(d =>
          d.id === action.payload.deckId
            ? {
                ...d,
                cards: action.payload.cards,
                ...(d.commanderIds
                  ? { commanderIds: d.commanderIds.filter(id => action.payload.cards.some(c => c.id === id)) }
                  : {}),
              }
            : d
        )
      };
    case "TOGGLE_ACQUIRED":
      return {
        ...state,
        decks: state.decks.map(d => {
          if (d.id !== action.payload.deckId) return d;
          const target = d.cards.find(c => c.id === action.payload.cardId);
          // Unchecking a card means the deck is no longer fully acquired, so it can't stay Built.
          const unchecking = !!target?.acquired;
          const cards = d.cards.map(c =>
            c.id === action.payload.cardId ? { ...c, acquired: !c.acquired } : c
          );
          // Checking the last card finishes the deck: it becomes Built, with the Built rule applied.
          if (target && !unchecking && !d.isBuilt && cards.every(c => c.acquired)) {
            return { ...d, isBuilt: true, cards: builtCards(cards) };
          }
          return { ...d, cards, ...(unchecking && d.isBuilt ? { isBuilt: false } : {}) };
        })
      };
    case "SET_CARD_SOURCE":
      return {
        ...state,
        decks: state.decks.map(d =>
          d.id === action.payload.deckId
            ? {
                ...d,
                cards: d.cards.map(c =>
                  c.id === action.payload.cardId
                    ? { ...c, source: action.payload.source, manuallyTagged: true }
                    : c
                )
              }
            : d
        )
      };
    case "BULK_SET_SOURCE":
      return {
        ...state,
        decks: state.decks.map(d =>
          d.id === action.payload.deckId
            ? {
                ...d,
                cards: d.cards.map(c =>
                  action.payload.cardIds.includes(c.id)
                    ? { ...c, source: action.payload.source, manuallyTagged: true }
                    : c
                )
              }
            : d
        )
      };
    case "APPLY_COLLECTION":
      return {
        ...state,
        decks: state.decks.map(d => ({
          ...d,
          cards: applyCollectionToCards(d.cards, action.payload)
        }))
      };
    case "REMOVE_CARD":
      return {
        ...state,
        decks: state.decks.map(d =>
          d.id === action.payload.deckId
            ? {
                ...d,
                cards: d.cards.filter(c => c.id !== action.payload.cardId),
                ...(d.commanderIds?.includes(action.payload.cardId)
                  ? { commanderIds: d.commanderIds.filter(id => id !== action.payload.cardId) }
                  : {}),
              }
            : d
        )
      };
    case "TOGGLE_COMMANDER":
      return {
        ...state,
        decks: state.decks.map(d => {
          if (d.id !== action.payload.deckId) return d;
          const { cardId } = action.payload;
          const ids = d.commanderIds ?? [];
          if (ids.includes(cardId)) {
            return { ...d, commanderIds: ids.filter(id => id !== cardId) };
          }
          const card = d.cards.find(c => c.id === cardId);
          if (!card || card.quantity !== 1 || ids.length >= MAX_COMMANDERS) return d;
          return { ...d, commanderIds: [...ids, cardId] };
        })
      };
    case "DISMISS_COMMANDER_PROMPT":
      return {
        ...state,
        decks: state.decks.map(d =>
          d.id === action.payload.deckId ? { ...d, commanderPromptDismissed: true } : d
        )
      };
    case "UPDATE_CARD_QUANTITY":
      return {
        ...state,
        decks: state.decks.map(d =>
          d.id === action.payload.deckId
            ? {
                ...d,
                cards: d.cards.map(c =>
                  c.id === action.payload.cardId ? { ...c, quantity: action.payload.quantity } : c
                )
              }
            : d
        )
      };
    case "ADD_CARD":
      return {
        ...state,
        decks: state.decks.map(d =>
          d.id === action.payload.deckId
            ? { ...d, cards: [...d.cards, action.payload.card] }
            : d
        )
      };
    case "CANCEL_ORDER_LINES": {
      const { cardIdsByDeck } = action.payload;
      return {
        ...state,
        decks: state.decks.map(d => cardIdsByDeck[d.id] ? cancelOrderLines(d, cardIdsByDeck[d.id], action.payload) : d),
      };
    }
    case "DISMISS_NOTIFICATION":
      return {
        ...state,
        decks: state.decks.map(d =>
          d.id === action.payload.deckId
            ? { ...d, notifications: (d.notifications ?? []).filter(n => n.id !== action.payload.notificationId) }
            : d
        )
      };
    case "SET_DECKS":
      return { ...state, decks: action.payload };
    case "SET_EXTRA_INFO":
      return {
        ...state,
        decks: state.decks.map(d =>
          d.id === action.payload.deckId
            ? { ...d, extraInfo: action.payload.extraInfo }
            : d
        ),
      };
    case "SET_DECK_PRICES": {
      // A card absent from `prices` keeps its prior price; null clears it (Scryfall has no price).
      // `updatedAt` is omitted after a partial failure so the deck still reads as stale.
      const { deckId, prices, updatedAt } = action.payload;
      return {
        ...state,
        decks: state.decks.map(d =>
          d.id === deckId
            ? {
                ...d,
                cards: d.cards.map(c =>
                  c.id in prices ? { ...c, price: prices[c.id] ?? undefined } : c
                ),
                pricesUpdatedAt: updatedAt ?? d.pricesUpdatedAt,
              }
            : d
        ),
      };
    }
    case "SET_DECK_BUILT": {
      const { deckId, built, collection } = action.payload;
      return {
        ...state,
        decks: state.decks.map(d => {
          if (d.id !== deckId) return d;
          return built
            ? { ...d, isBuilt: true, cards: builtCards(d.cards) }
            : { ...d, isBuilt: false, cards: unbuiltCards(d.cards, collection) };
        }),
      };
    }
    case "REMAP_DECK_ERROR": {
      // A remap finishes after a Scryfall lookup; if the deck was deleted meanwhile there is nothing to update.
      const { deckId, originalName, searchName, card } = action.payload;
      if (!state.decks.some(d => d.id === deckId)) return state;
      const errors = updateError(state.errors, deckId, originalName, card ? { searchName, resolved: true } : { searchName });
      if (!card) return { ...state, errors };
      // Appends to the deck as it is now, not as it was when the lookup started.
      return {
        ...state,
        decks: state.decks.map(d => d.id === deckId ? { ...d, cards: [...d.cards, card] } : d),
        errors,
      };
    }
    case "DISMISS_DECK_ERROR":
      return { ...state, errors: updateError(state.errors, action.payload.deckId, action.payload.originalName, { resolved: true }) };
    default:
      return state;
  }
}

const DeckContext = createContext<{ state: DeckState; dispatch: Dispatch<DeckAction> } | undefined>(undefined);

// Each key is named at its localStorage call, so the storageKeys scan can see who writes it.
function parseSaved<T>(read: () => string | null, empty: T): T {
  try {
    const raw = read();
    return raw ? (JSON.parse(raw) as T) : empty;
  } catch {
    return empty;
  }
}

function trySave(write: () => void) {
  try {
    write();
  } catch {
    // Quota exceeded or storage unavailable: keep working in memory.
  }
}

/**
 * Owns the decks and their Deck errors: loads each from localStorage once and saves it after every
 * change, so there is no second copy to drift (#204, #214). `initialDecks` and `initialErrors`
 * replace what is saved; tests use them.
 */
export function DeckProvider({ children, initialDecks, initialErrors }: { children: ReactNode; initialDecks?: Deck[]; initialErrors?: DeckErrors }) {
  const [state, dispatch] = useReducer(deckReducer, undefined, () => ({
    decks: initialDecks ?? parseSaved<Deck[]>(() => window.localStorage.getItem(DECKS_KEY), []),
    errors: initialErrors ?? parseSaved<DeckErrors>(() => window.localStorage.getItem(ERRORS_KEY), {}),
  }));
  // Separate effects, so changing one doesn't rewrite the other.
  useEffect(() => { trySave(() => window.localStorage.setItem(DECKS_KEY, JSON.stringify(state.decks))); }, [state.decks]);
  useEffect(() => { trySave(() => window.localStorage.setItem(ERRORS_KEY, JSON.stringify(state.errors))); }, [state.errors]);
  // Every Collection change re-tags decks. The starting Collection doesn't: stored decks already match it.
  // Layout effects run before children's passive effects, so a change made on mount isn't missed.
  useLayoutEffect(() => {
    let last = collectionStore.get();
    return collectionStore.subscribe(() => {
      const next = collectionStore.get();
      if (next === last) return;
      last = next;
      dispatch({ type: "APPLY_COLLECTION", payload: next });
    });
  }, []);
  return createElement(DeckContext.Provider, { value: { state, dispatch } }, children);
}

export function useDecks() {
  const context = useContext(DeckContext);
  if (context === undefined) {
    throw new Error("useDecks must be used within a DeckProvider");
  }
  return context;
}
