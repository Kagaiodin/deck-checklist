import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DeckProvider, useDecks } from "../decks";
import type { Deck } from "../../types/index";

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
