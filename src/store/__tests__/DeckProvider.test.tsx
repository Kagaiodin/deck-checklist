import { describe, it, expect, vi } from "vitest";
import { useEffect } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { DeckProvider, useDecks } from "../decks";
import { collectionStore } from "../collection";
import type { Card, Deck } from "../../types/index";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDeck(overrides: Partial<Deck> & { id: string; name: string }): Deck {
  return { cards: [], createdAt: Date.now(), ...overrides };
}

// Minimal consumer component: renders the current deck count
function DeckCountDisplay() {
  const { state } = useDecks();
  return <span data-testid="count">{state.decks.length}</span>;
}

// Consumer that dispatches ADD_DECK when the button is clicked
function AddDeckButton({ deck }: { deck: Deck }) {
  const { dispatch } = useDecks();
  return (
    <button onClick={() => dispatch({ type: "ADD_DECK", payload: deck })}>
      Add
    </button>
  );
}

// ── DeckProvider ──────────────────────────────────────────────────────────────

describe("DeckProvider", () => {
  it("renders its children", () => {
    render(
      <DeckProvider>
        <span data-testid="child">hello</span>
      </DeckProvider>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("starts with an empty deck list when no initialDecks are provided", () => {
    render(
      <DeckProvider>
        <DeckCountDisplay />
      </DeckProvider>
    );
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("initialises state with the provided initialDecks prop", () => {
    render(
      <DeckProvider initialDecks={[makeDeck({ id: "d1", name: "Burn" })]}>
        <DeckCountDisplay />
      </DeckProvider>
    );
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("dispatched actions flow through the reducer and update context consumers", () => {
    const deck = makeDeck({ id: "d1", name: "Burn" });
    render(
      <DeckProvider>
        <DeckCountDisplay />
        <AddDeckButton deck={deck} />
      </DeckProvider>
    );
    expect(screen.getByTestId("count").textContent).toBe("0");
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("count").textContent).toBe("1");
  });
});

// ── useDecks ──────────────────────────────────────────────────────────────────

describe("useDecks", () => {
  it("throws when called outside a DeckProvider", () => {
    // Suppress React's own error logging so test output stays clean
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => render(<DeckCountDisplay />)).toThrow(
        "useDecks must be used within a DeckProvider"
      );
    } finally {
      spy.mockRestore();
    }
  });
});

// ── Collection re-tagging ─────────────────────────────────────────────────────

describe("DeckProvider — Collection changes", () => {
  const ring = (source?: Card["source"]) => ({ id: "c1", name: "Sol Ring", quantity: 1, acquired: false, source } as unknown as Card);
  const renders: Deck[][] = [];
  function Probe() {
    const { state } = useDecks();
    renders.push(state.decks);
    return <span data-testid="source">{state.decks[0]?.cards[0]?.source ?? "none"}</span>;
  }
  const mount = (source?: Card["source"]) => {
    renders.length = 0;
    render(<DeckProvider initialDecks={[makeDeck({ id: "d1", name: "A", cards: [ring(source)] })]}><Probe /></DeckProvider>);
  };

  it("re-tags decks when the Collection changes", () => {
    mount();
    act(() => collectionStore.update(c => ({ ...c, "sol ring": [{ quantity: 1 }] })));
    expect(screen.getByTestId("source").textContent).toBe("owned");
  });

  it("leaves decks alone for the Collection it starts with", () => {
    // Stored decks already reflect the stored Collection; mounting must not re-tag them.
    mount("owned");
    expect(screen.getByTestId("source").textContent).toBe("owned");
  });

  it("re-tags for a change a child makes while mounting", () => {
    function AddsOnMount() {
      useEffect(() => collectionStore.update(c => ({ ...c, "sol ring": [{ quantity: 1 }] })), []);
      return null;
    }
    render(<DeckProvider initialDecks={[makeDeck({ id: "d1", name: "A", cards: [ring()] })]}><AddsOnMount /><Probe /></DeckProvider>);
    expect(screen.getByTestId("source").textContent).toBe("owned");
  });

  it("does not re-tag when only the meta changes", () => {
    mount();
    const before = renders.at(-1);
    act(() => collectionStore.replace(collectionStore.get(), { fileName: "x.csv", importedAt: 1, cardCount: 0 }));
    expect(renders.at(-1)).toBe(before);
  });
});
