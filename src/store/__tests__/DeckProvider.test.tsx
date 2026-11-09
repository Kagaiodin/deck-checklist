import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useEffect } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { DeckProvider, useDecks } from "../decks";
import { collectionStore } from "../collection";
import { DECKS_KEY, ERRORS_KEY } from "../storageKeys";
import { MemoryStorage } from "../../features/demo/__tests__/memoryStorage";
import type { Card, Deck } from "../../types/index";

// DeckProvider saves the decks, so every test gets its own storage; otherwise one test's decks load
// into the next. Stubbed because jsdom's localStorage persists across a file's tests, and Node 25+'s
// built-in one (undefined without --localstorage-file) hides it, so CI and local runs differ.
let storage: MemoryStorage;
beforeEach(() => { storage = new MemoryStorage(); vi.stubGlobal("localStorage", storage); });
afterEach(() => { vi.unstubAllGlobals(); });

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

// ── Saving ────────────────────────────────────────────────────────────────────

describe("DeckProvider — saved decks", () => {
  const saved = () => JSON.parse(storage.getItem(DECKS_KEY) ?? "null") as Deck[] | null;

  it("starts empty when nothing is saved", () => {
    render(<DeckProvider><DeckCountDisplay /></DeckProvider>);
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("starts from the saved decks", () => {
    storage.setItem(DECKS_KEY, JSON.stringify([makeDeck({ id: "d1", name: "Burn" })]));
    render(<DeckProvider><DeckCountDisplay /></DeckProvider>);
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("starts empty when the saved decks can't be read", () => {
    storage.setItem(DECKS_KEY, "{oops");
    render(<DeckProvider><DeckCountDisplay /></DeckProvider>);
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("saves the decks after every change", () => {
    render(<DeckProvider><AddDeckButton deck={makeDeck({ id: "d1", name: "Burn" })} /></DeckProvider>);
    fireEvent.click(screen.getByRole("button"));
    expect(saved()?.map(d => d.id)).toEqual(["d1"]);
  });
});

// ── Deck errors ───────────────────────────────────────────────────────────────

describe("DeckProvider — saved Deck errors", () => {
  const savedErrors = () => JSON.parse(storage.getItem(ERRORS_KEY) ?? "null") as unknown;
  const error = { originalName: "Lightnig Bolt", searchName: "Lightnig Bolt", resolved: false };

  function ErrorCount({ deckId }: { deckId: string }) {
    const { state } = useDecks();
    return <span data-testid="errors">{(state.errors[deckId] ?? []).length}</span>;
  }

  function DeleteButton({ id }: { id: string }) {
    const { dispatch } = useDecks();
    return <button onClick={() => dispatch({ type: "DELETE_DECK", payload: id })}>Delete</button>;
  }

  it("starts from the saved errors", () => {
    storage.setItem(ERRORS_KEY, JSON.stringify({ d1: [error] }));
    render(<DeckProvider><ErrorCount deckId="d1" /></DeckProvider>);
    expect(screen.getByTestId("errors").textContent).toBe("1");
  });

  it("starts with no errors when the saved errors can't be read", () => {
    storage.setItem(ERRORS_KEY, "{oops");
    render(<DeckProvider><ErrorCount deckId="d1" /></DeckProvider>);
    expect(screen.getByTestId("errors").textContent).toBe("0");
  });

  it("initialErrors replaces the saved errors", () => {
    storage.setItem(ERRORS_KEY, JSON.stringify({ d1: [error] }));
    render(<DeckProvider initialErrors={{}}><ErrorCount deckId="d1" /></DeckProvider>);
    expect(screen.getByTestId("errors").textContent).toBe("0");
  });

  it("saves the errors after every change", () => {
    render(
      <DeckProvider initialDecks={[makeDeck({ id: "d1", name: "Burn" }), makeDeck({ id: "d2", name: "Other" })]} initialErrors={{ d1: [error], d2: [error] }}>
        <DeleteButton id="d1" />
      </DeckProvider>
    );
    fireEvent.click(screen.getByRole("button"));
    expect(savedErrors()).toEqual({ d2: [error] });
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
