import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCommittedInfo } from "../useCommittedInfo";
import type { Deck, Card } from "../../../../types/index";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "c1",
    name: "lightning bolt",
    quantity: 1,
    acquired: false,
    color: ["R"],
    type: "Instant",
    ...overrides,
  };
}

function makeDeck(overrides: Partial<Deck> & { cards: Card[] }): Deck {
  return {
    id: "d1",
    name: "Burn",
    createdAt: 0,
    ...overrides,
  };
}

describe("useCommittedInfo", () => {
  it("returns zero when card is in a deck but not checked off", () => {
    const decks = [makeDeck({ cards: [makeCard({ acquired: false })] })];
    const { result } = renderHook(() => useCommittedInfo(decks));
    expect(result.current("lightning bolt")).toEqual({ total: 0, deckCount: 0, decks: [] });
  });

  it("counts copies when card is checked off", () => {
    const decks = [makeDeck({ cards: [makeCard({ acquired: true, quantity: 2 })] })];
    const { result } = renderHook(() => useCommittedInfo(decks));
    expect(result.current("lightning bolt")).toEqual({
      total: 2,
      deckCount: 1,
      decks: [{ name: "Burn", qty: 2 }],
    });
  });

  it("only counts acquired copies across mixed decks", () => {
    const decks = [
      makeDeck({ id: "d1", name: "Burn", cards: [makeCard({ acquired: true, quantity: 1 })] }),
      makeDeck({ id: "d2", name: "Storm", cards: [makeCard({ acquired: false, quantity: 1 })] }),
    ];
    const { result } = renderHook(() => useCommittedInfo(decks));
    const info = result.current("lightning bolt");
    expect(info.total).toBe(1);
    expect(info.deckCount).toBe(1);
    expect(info.decks).toEqual([{ name: "Burn", qty: 1 }]);
  });

  it("returns zero when no decks contain the card", () => {
    const decks = [makeDeck({ cards: [makeCard({ name: "counterspell", acquired: true })] })];
    const { result } = renderHook(() => useCommittedInfo(decks));
    expect(result.current("lightning bolt")).toEqual({ total: 0, deckCount: 0, decks: [] });
  });

  it("sums acquired copies across multiple decks", () => {
    const decks = [
      makeDeck({ id: "d1", name: "Burn", cards: [makeCard({ acquired: true, quantity: 3 })] }),
      makeDeck({ id: "d2", name: "Zoo", cards: [makeCard({ acquired: true, quantity: 1 })] }),
    ];
    const { result } = renderHook(() => useCommittedInfo(decks));
    const info = result.current("lightning bolt");
    expect(info.total).toBe(4);
    expect(info.deckCount).toBe(2);
  });
});
