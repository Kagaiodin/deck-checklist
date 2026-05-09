import type { Deck } from "../types/index";
import { useReducer, createContext, useContext, createElement } from "react";
import type { Dispatch, ReactNode } from "react";

type DeckState = {
  decks: Deck[];
};

type DeckAction =
  | { type: "ADD_DECK"; payload: Deck }
  | { type: "DELETE_DECK"; payload: string }
  | { type: "RENAME_DECK"; payload: { id: string; name: string } }
  | { type: "SET_CARDS"; payload: { deckId: string; cards: Deck["cards"] } }
  | { type: "TOGGLE_ACQUIRED"; payload: { deckId: string; cardId: string } }
  | { type: "SET_CARD_SOURCE"; payload: { deckId: string; cardId: string; source: import("../types/index").AcquisitionSource | undefined } }
  | { type: "BULK_SET_SOURCE"; payload: { deckId: string; cardIds: string[]; source: import("../types/index").AcquisitionSource | undefined } };

function deckReducer(state: DeckState, action: DeckAction): DeckState {
  switch (action.type) {
    case "ADD_DECK":
      return { ...state, decks: [...state.decks, action.payload] };
    case "DELETE_DECK":
      return { ...state, decks: state.decks.filter(d => d.id !== action.payload) };
    case "RENAME_DECK":
      return {
        ...state,
        decks: state.decks.map(d =>
          d.id === action.payload.id ? { ...d, name: action.payload.name } : d
        )
      };
    case "SET_CARDS":
      return {
        ...state,
        decks: state.decks.map(d =>
          d.id === action.payload.deckId ? { ...d, cards: action.payload.cards } : d
        )
      };
    case "TOGGLE_ACQUIRED":
      return {
        ...state,
        decks: state.decks.map(d =>
          d.id === action.payload.deckId
            ? {
                ...d,
                cards: d.cards.map(c =>
                  c.id === action.payload.cardId ? { ...c, acquired: !c.acquired } : c
                )
              }
            : d
        )
      };
    case "SET_CARD_SOURCE":
      return {
        ...state,
        decks: state.decks.map(d =>
          d.id === action.payload.deckId
            ? {
                ...d,
                cards: d.cards.map(c =>
                  c.id === action.payload.cardId ? { ...c, source: action.payload.source } : c
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
                  action.payload.cardIds.includes(c.id) ? { ...c, source: action.payload.source } : c
                )
              }
            : d
        )
      };
    default:
      return state;
  }
}

const DeckContext = createContext<{ state: DeckState; dispatch: Dispatch<DeckAction> } | undefined>(undefined);

export function DeckProvider({ children, initialDecks = [] }: { children: ReactNode; initialDecks?: Deck[] }) {
  const [state, dispatch] = useReducer(deckReducer, { decks: initialDecks });
  return createElement(DeckContext.Provider, { value: { state, dispatch } }, children);
}

export function useDecks() {
  const context = useContext(DeckContext);
  if (context === undefined) {
    throw new Error("useDecks must be used within a DeckProvider");
  }
  return context;
}
