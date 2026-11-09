import { describe, it, expect } from "vitest";
import { deckReducer, type DeckState } from "../decks";
import type { Deck } from "../../types/index";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDeck(overrides: Partial<Deck> & { id: string; name: string }): Deck {
  return {
    cards: [],
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeCard(overrides: Partial<Deck["cards"][number]> & { id: string; name: string }) {
  return {
    quantity: 1,
    acquired: false,
    color: [],
    type: "Instant",
    ...overrides,
  };
}

const emptyState = { errors: {}, decks: [] };

// ── ADD_DECK ──────────────────────────────────────────────────────────────────

describe("ADD_DECK", () => {
  it("adds a new deck to the list", () => {
    const deck = makeDeck({ id: "d1", name: "Burn" });
    const state = deckReducer(emptyState, { type: "ADD_DECK", payload: deck });
    expect(state.decks).toHaveLength(1);
    expect(state.decks[0].id).toBe("d1");
  });

  it("names an unnamed deck after its position", () => {
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn" })] };
    const state = deckReducer(initial, { type: "ADD_DECK", payload: makeDeck({ id: "d2", name: "  " }) });
    expect(state.decks[1].name).toBe("Deck 2");
  });

  it("applies the Built rule to a deck that arrives Built", () => {
    const cards = [
      makeCard({ id: "c1", name: "Bolt", source: "ordered" }),
      makeCard({ id: "c2", name: "Fake", source: "proxy", manuallyTagged: true }),
    ];
    const state = deckReducer(emptyState, { type: "ADD_DECK", payload: makeDeck({ id: "d1", name: "Burn", cards, isBuilt: true }) });
    expect(state.decks[0].cards.map(c => [c.acquired, c.source, c.manuallyTagged])).toEqual([
      [true, "owned", true],
      [true, "proxy", true],
    ]);
  });

  it("leaves the cards of a deck that isn't Built alone", () => {
    const cards = [makeCard({ id: "c1", name: "Bolt", source: "ordered" })];
    const state = deckReducer(emptyState, { type: "ADD_DECK", payload: makeDeck({ id: "d1", name: "Burn", cards }) });
    expect(state.decks[0].cards).toEqual(cards);
  });

  it("preserves existing decks", () => {
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn" })] };
    const state = deckReducer(initial, {
      type: "ADD_DECK",
      payload: makeDeck({ id: "d2", name: "Control" }),
    });
    expect(state.decks).toHaveLength(2);
  });
});

// ── DELETE_DECK ───────────────────────────────────────────────────────────────

describe("DELETE_DECK", () => {
  it("removes the deck with the given id", () => {
    const initial = {
      errors: {},
      decks: [makeDeck({ id: "d1", name: "Burn" }), makeDeck({ id: "d2", name: "Control" })],
    };
    const state = deckReducer(initial, { type: "DELETE_DECK", payload: "d1" });
    expect(state.decks).toHaveLength(1);
    expect(state.decks[0].id).toBe("d2");
  });

  it("does nothing if the id does not exist", () => {
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn" })] };
    const state = deckReducer(initial, { type: "DELETE_DECK", payload: "nope" });
    expect(state.decks).toHaveLength(1);
  });
});

// ── RENAME_DECK ───────────────────────────────────────────────────────────────

describe("RENAME_DECK", () => {
  it("updates the name of the target deck", () => {
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Old Name" })] };
    const state = deckReducer(initial, {
      type: "RENAME_DECK",
      payload: { id: "d1", name: "New Name" },
    });
    expect(state.decks[0].name).toBe("New Name");
  });

  it("does not affect other decks", () => {
    const initial = {
      errors: {},
      decks: [makeDeck({ id: "d1", name: "Burn" }), makeDeck({ id: "d2", name: "Control" })],
    };
    const state = deckReducer(initial, {
      type: "RENAME_DECK",
      payload: { id: "d1", name: "Red Deck Wins" },
    });
    expect(state.decks[1].name).toBe("Control");
  });
});

// ── SET_CARDS ─────────────────────────────────────────────────────────────────

describe("SET_CARDS", () => {
  it("replaces the card list for the target deck", () => {
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn" })] };
    const newCards = [makeCard({ id: "c1", name: "Lightning Bolt" })];
    const state = deckReducer(initial, {
      type: "SET_CARDS",
      payload: { deckId: "d1", cards: newCards },
    });
    expect(state.decks[0].cards).toHaveLength(1);
    expect(state.decks[0].cards[0].name).toBe("Lightning Bolt");
  });
});

// ── TOGGLE_ACQUIRED ───────────────────────────────────────────────────────────

describe("TOGGLE_ACQUIRED", () => {
  it("flips acquired from false to true", () => {
    const card = makeCard({ id: "c1", name: "Lightning Bolt", acquired: false });
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn", cards: [card] })] };
    const state = deckReducer(initial, {
      type: "TOGGLE_ACQUIRED",
      payload: { deckId: "d1", cardId: "c1" },
    });
    expect(state.decks[0].cards[0].acquired).toBe(true);
  });

  it("flips acquired from true to false", () => {
    const card = makeCard({ id: "c1", name: "Lightning Bolt", acquired: true });
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn", cards: [card] })] };
    const state = deckReducer(initial, {
      type: "TOGGLE_ACQUIRED",
      payload: { deckId: "d1", cardId: "c1" },
    });
    expect(state.decks[0].cards[0].acquired).toBe(false);
  });

  it("clears isBuilt when a card is unchecked in a built deck", () => {
    const cards = [
      makeCard({ id: "c1", name: "Lightning Bolt", acquired: true }),
      makeCard({ id: "c2", name: "Shock", acquired: true }),
    ];
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn", cards, isBuilt: true })] };
    const state = deckReducer(initial, {
      type: "TOGGLE_ACQUIRED",
      payload: { deckId: "d1", cardId: "c1" },
    });
    expect(state.decks[0].isBuilt).toBe(false);
  });

  it("keeps isBuilt when checking a card in a built deck", () => {
    const card = makeCard({ id: "c1", name: "Lightning Bolt", acquired: false });
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn", cards: [card], isBuilt: true })] };
    const state = deckReducer(initial, {
      type: "TOGGLE_ACQUIRED",
      payload: { deckId: "d1", cardId: "c1" },
    });
    expect(state.decks[0].isBuilt).toBe(true);
  });

  it("checking the last card marks the deck Built and applies the Built rule", () => {
    const cards = [
      makeCard({ id: "c1", name: "Lightning Bolt", acquired: false }),
      makeCard({ id: "c2", name: "Shock", acquired: true, source: "ordered" }),
      makeCard({ id: "c3", name: "Fake", acquired: true, source: "proxy", manuallyTagged: true }),
    ];
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn", cards })] };
    const state = deckReducer(initial, { type: "TOGGLE_ACQUIRED", payload: { deckId: "d1", cardId: "c1" } });
    expect(state.decks[0].isBuilt).toBe(true);
    expect(state.decks[0].cards.map(c => [c.acquired, c.source])).toEqual([[true, "owned"], [true, "owned"], [true, "proxy"]]);
  });

  it("checking a card while others are unchecked leaves the deck unbuilt", () => {
    const cards = [
      makeCard({ id: "c1", name: "Lightning Bolt", acquired: false }),
      makeCard({ id: "c2", name: "Shock", acquired: false, source: "ordered" }),
    ];
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn", cards })] };
    const state = deckReducer(initial, { type: "TOGGLE_ACQUIRED", payload: { deckId: "d1", cardId: "c1" } });
    expect(state.decks[0].isBuilt).toBeUndefined();
    expect(state.decks[0].cards[1].source).toBe("ordered");
  });

  it("does not set isBuilt on a deck that was never built", () => {
    const card = makeCard({ id: "c1", name: "Lightning Bolt", acquired: true });
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn", cards: [card] })] };
    const state = deckReducer(initial, {
      type: "TOGGLE_ACQUIRED",
      payload: { deckId: "d1", cardId: "c1" },
    });
    expect(state.decks[0].isBuilt).toBeUndefined();
  });
});

// ── SET_CARD_SOURCE ───────────────────────────────────────────────────────────

describe("SET_CARD_SOURCE", () => {
  it("sets the source on the target card", () => {
    const card = makeCard({ id: "c1", name: "Lightning Bolt" });
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn", cards: [card] })] };
    const state = deckReducer(initial, {
      type: "SET_CARD_SOURCE",
      payload: { deckId: "d1", cardId: "c1", source: "ordered" },
    });
    expect(state.decks[0].cards[0].source).toBe("ordered");
  });

  it("sets manuallyTagged to true", () => {
    const card = makeCard({ id: "c1", name: "Lightning Bolt" });
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn", cards: [card] })] };
    const state = deckReducer(initial, {
      type: "SET_CARD_SOURCE",
      payload: { deckId: "d1", cardId: "c1", source: "proxy" },
    });
    expect(state.decks[0].cards[0].manuallyTagged).toBe(true);
  });

  it("clears the source when payload source is undefined", () => {
    const card = makeCard({ id: "c1", name: "Lightning Bolt", source: "owned" });
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn", cards: [card] })] };
    const state = deckReducer(initial, {
      type: "SET_CARD_SOURCE",
      payload: { deckId: "d1", cardId: "c1", source: undefined },
    });
    expect(state.decks[0].cards[0].source).toBeUndefined();
  });
});

// ── BULK_SET_SOURCE ───────────────────────────────────────────────────────────

describe("BULK_SET_SOURCE", () => {
  it("sets the source on all specified card ids", () => {
    const cards = [
      makeCard({ id: "c1", name: "Lightning Bolt" }),
      makeCard({ id: "c2", name: "Lava Spike" }),
      makeCard({ id: "c3", name: "Shard Volley" }),
    ];
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn", cards })] };
    const state = deckReducer(initial, {
      type: "BULK_SET_SOURCE",
      payload: { deckId: "d1", cardIds: ["c1", "c2"], source: "ordered" },
    });
    expect(state.decks[0].cards[0].source).toBe("ordered");
    expect(state.decks[0].cards[1].source).toBe("ordered");
    expect(state.decks[0].cards[2].source).toBeUndefined(); // untouched
  });

  it("sets manuallyTagged to true on all targeted cards", () => {
    const cards = [makeCard({ id: "c1", name: "Lightning Bolt" })];
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn", cards })] };
    const state = deckReducer(initial, {
      type: "BULK_SET_SOURCE",
      payload: { deckId: "d1", cardIds: ["c1"], source: "borrowed" },
    });
    expect(state.decks[0].cards[0].manuallyTagged).toBe(true);
  });
});

// ── APPLY_COLLECTION ──────────────────────────────────────────────────────────

describe("APPLY_COLLECTION", () => {
  it("marks a card as 'owned' when the collection covers the quantity", () => {
    const card = makeCard({ id: "c1", name: "Lightning Bolt", quantity: 4 });
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn", cards: [card] })] };
    const state = deckReducer(initial, {
      type: "APPLY_COLLECTION",
      payload: { "lightning bolt": [{ quantity: 4 }] },
    });
    expect(state.decks[0].cards[0].source).toBe("owned");
  });

  it("does not overwrite manually tagged cards", () => {
    const card = makeCard({
      id: "c1",
      name: "Lightning Bolt",
      quantity: 4,
      source: "proxy",
      manuallyTagged: true,
    });
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn", cards: [card] })] };
    const state = deckReducer(initial, {
      type: "APPLY_COLLECTION",
      payload: { "lightning bolt": [{ quantity: 10 }] },
    });
    expect(state.decks[0].cards[0].source).toBe("proxy"); // unchanged
  });

  it("applies across multiple decks", () => {
    const initial = {
      errors: {},
      decks: [
        makeDeck({ id: "d1", name: "Burn", cards: [makeCard({ id: "c1", name: "Lightning Bolt", quantity: 4 })] }),
        makeDeck({ id: "d2", name: "Storm", cards: [makeCard({ id: "c2", name: "Lightning Bolt", quantity: 1 })] }),
      ],
    };
    const state = deckReducer(initial, {
      type: "APPLY_COLLECTION",
      payload: { "lightning bolt": [{ quantity: 10 }] },
    });
    expect(state.decks[0].cards[0].source).toBe("owned");
    expect(state.decks[1].cards[0].source).toBe("owned");
  });
});

// ── REMOVE_CARD ───────────────────────────────────────────────────────────────

describe("REMOVE_CARD", () => {
  it("removes the card from the deck", () => {
    const cards = [
      makeCard({ id: "c1", name: "Lightning Bolt" }),
      makeCard({ id: "c2", name: "Lava Spike" }),
    ];
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn", cards })] };
    const state = deckReducer(initial, {
      type: "REMOVE_CARD",
      payload: { deckId: "d1", cardId: "c1" },
    });
    expect(state.decks[0].cards).toHaveLength(1);
    expect(state.decks[0].cards[0].id).toBe("c2");
  });
});

// ── UPDATE_CARD_QUANTITY ──────────────────────────────────────────────────────

describe("UPDATE_CARD_QUANTITY", () => {
  it("updates the quantity of the target card", () => {
    const card = makeCard({ id: "c1", name: "Lightning Bolt", quantity: 2 });
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn", cards: [card] })] };
    const state = deckReducer(initial, {
      type: "UPDATE_CARD_QUANTITY",
      payload: { deckId: "d1", cardId: "c1", quantity: 4 },
    });
    expect(state.decks[0].cards[0].quantity).toBe(4);
  });
});

// ── ADD_CARD ──────────────────────────────────────────────────────────────────

describe("ADD_CARD", () => {
  it("appends a card to the deck", () => {
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn" })] };
    const newCard = makeCard({ id: "c1", name: "Lightning Bolt" });
    const state = deckReducer(initial, {
      type: "ADD_CARD",
      payload: { deckId: "d1", card: newCard },
    });
    expect(state.decks[0].cards).toHaveLength(1);
    expect(state.decks[0].cards[0].name).toBe("Lightning Bolt");
  });

  it("does not affect other decks", () => {
    const initial = {
      errors: {},
      decks: [
        makeDeck({ id: "d1", name: "Burn" }),
        makeDeck({ id: "d2", name: "Control" }),
      ],
    };
    const state = deckReducer(initial, {
      type: "ADD_CARD",
      payload: { deckId: "d1", card: makeCard({ id: "c1", name: "Lightning Bolt" }) },
    });
    expect(state.decks[1].cards).toHaveLength(0);
  });
});

// ── CANCEL_ORDER_LINES ────────────────────────────────────────────────────────

describe("CANCEL_ORDER_LINES", () => {
  const cancel = (cardIdsByDeck: Record<string, string[]>, collection = {}) => ({
    type: "CANCEL_ORDER_LINES" as const,
    payload: { orderId: "o1", orderLabel: "Card Kingdom", cardIdsByDeck, collection, createdAt: 7 },
  });

  it("clears the Ordered tag on linked cards and leaves cards the user re-tagged alone", () => {
    const cards = [
      makeCard({ id: "c1", name: "Lightning Bolt", source: "ordered", manuallyTagged: true }),
      makeCard({ id: "c2", name: "Lava Spike", source: "proxy", manuallyTagged: true }),
      makeCard({ id: "c3", name: "Rift Bolt", source: "ordered", manuallyTagged: true }),
    ];
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn", cards })] };
    const state = deckReducer(initial, cancel({ d1: ["c1", "c2"] }));
    const [c1, c2, c3] = state.decks[0].cards;
    expect([c1.source, c1.manuallyTagged]).toEqual([undefined, false]);
    expect([c2.source, c2.manuallyTagged]).toEqual(["proxy", true]);
    expect([c3.source, c3.manuallyTagged]).toEqual(["ordered", true]); // not on the order
  });

  it("re-tags cleared cards from the Collection", () => {
    const cards = [makeCard({ id: "c1", name: "Lightning Bolt", source: "ordered", manuallyTagged: true })];
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn", cards })] };
    const state = deckReducer(initial, cancel({ d1: ["c1"] }, { "lightning bolt": [{ quantity: 1 }] }));
    expect(state.decks[0].cards[0].source).toBe("owned");
  });

  it("notifies each deck where cards were cleared, listing only those cards", () => {
    const initial = {
      errors: {},
      decks: [
        makeDeck({ id: "d1", name: "Burn", cards: [
          makeCard({ id: "c1", name: "Lightning Bolt", source: "ordered", manuallyTagged: true }),
          makeCard({ id: "c2", name: "Lava Spike", source: "owned", manuallyTagged: true }),
        ] }),
        makeDeck({ id: "d2", name: "Storm", cards: [makeCard({ id: "c3", name: "Dark Ritual", source: "proxy", manuallyTagged: true })] }),
      ],
    };
    const state = deckReducer(initial, cancel({ d1: ["c1", "c2"], d2: ["c3"] }));
    expect(state.decks[0].notifications).toEqual([{
      id: "o1_d1", type: "order_cancelled", orderId: "o1", orderLabel: "Card Kingdom", affectedCardIds: ["c1"], createdAt: 7,
    }]);
    expect(state.decks[1].notifications).toBeUndefined();
    expect(state.decks[1]).toBe(initial.decks[1]);
  });

  it("does not affect decks the order doesn't link to", () => {
    const initial = {
      errors: {},
      decks: [
        makeDeck({ id: "d1", name: "Burn", cards: [makeCard({ id: "c1", name: "Lightning Bolt", source: "ordered", manuallyTagged: true })] }),
        makeDeck({ id: "d2", name: "Storm", cards: [makeCard({ id: "c2", name: "Dark Ritual", source: "ordered", manuallyTagged: true })] }),
      ],
    };
    const state = deckReducer(initial, cancel({ d1: ["c1"] }));
    expect(state.decks[1]).toBe(initial.decks[1]);
  });
});

// ── DISMISS_NOTIFICATION ──────────────────────────────────────────────────────

describe("DISMISS_NOTIFICATION", () => {
  it("removes the notification with the given id", () => {
    const notifications = [
      { id: "n1", type: "order_cancelled" as const, orderId: "o1", orderLabel: "A", affectedCardIds: [], createdAt: 0 },
      { id: "n2", type: "order_cancelled" as const, orderId: "o2", orderLabel: "B", affectedCardIds: [], createdAt: 1 },
    ];
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn", notifications })] };
    const state = deckReducer(initial, {
      type: "DISMISS_NOTIFICATION",
      payload: { deckId: "d1", notificationId: "n1" },
    });
    expect(state.decks[0].notifications).toHaveLength(1);
    expect(state.decks[0].notifications![0].id).toBe("n2");
  });

  it("is a no-op when the notification id does not exist", () => {
    const notifications = [
      { id: "n1", type: "order_cancelled" as const, orderId: "o1", orderLabel: "A", affectedCardIds: [], createdAt: 0 },
    ];
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn", notifications })] };
    const state = deckReducer(initial, {
      type: "DISMISS_NOTIFICATION",
      payload: { deckId: "d1", notificationId: "nope" },
    });
    expect(state.decks[0].notifications).toHaveLength(1);
  });
});

// ── SET_DECK_FORMAT ───────────────────────────────────────────────────────────

describe("SET_DECK_FORMAT", () => {
  it("sets the format on the target deck", () => {
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn" })] };
    const state = deckReducer(initial, {
      type: "SET_DECK_FORMAT",
      payload: { id: "d1", format: "Modern" },
    });
    expect(state.decks[0].format).toBe("Modern");
  });

  it("clears the format when payload is undefined", () => {
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn", format: "Modern" })] };
    const state = deckReducer(initial, {
      type: "SET_DECK_FORMAT",
      payload: { id: "d1", format: undefined },
    });
    expect(state.decks[0].format).toBeUndefined();
  });

  it("does not affect other decks", () => {
    const initial = {
      errors: {},
      decks: [
        makeDeck({ id: "d1", name: "Burn" }),
        makeDeck({ id: "d2", name: "Control", format: "Legacy" }),
      ],
    };
    const state = deckReducer(initial, {
      type: "SET_DECK_FORMAT",
      payload: { id: "d1", format: "Modern" },
    });
    expect(state.decks[1].format).toBe("Legacy");
  });
});

// ── SET_DECKS ─────────────────────────────────────────────────────────────────

describe("SET_DECKS", () => {
  it("replaces the entire deck list", () => {
    const initial = {
      errors: {},
      decks: [makeDeck({ id: "d1", name: "Burn" }), makeDeck({ id: "d2", name: "Control" })],
    };
    const newDecks = [makeDeck({ id: "d3", name: "Storm" })];
    const state = deckReducer(initial, { type: "SET_DECKS", payload: newDecks });
    expect(state.decks).toHaveLength(1);
    expect(state.decks[0].id).toBe("d3");
  });

  it("can set decks to an empty list", () => {
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn" })] };
    const state = deckReducer(initial, { type: "SET_DECKS", payload: [] });
    expect(state.decks).toHaveLength(0);
  });
});

// ── default (unknown action) ──────────────────────────────────────────────────

describe("default branch", () => {
  it("returns state unchanged for an unknown action type", () => {
    const initial = { errors: {}, decks: [makeDeck({ id: "d1", name: "Burn" })] };
    // @ts-expect-error — intentionally sending an unknown action type
    const state = deckReducer(initial, { type: "UNKNOWN_ACTION" });
    expect(state).toBe(initial); // same reference — no copy made
  });
});


// ── SET_DECK_PRICES ───────────────────────────────────────────────────────────

describe("SET_DECK_PRICES", () => {
  const base = () => ({
    errors: {},
    decks: [
      makeDeck({
        id: "d1",
        name: "Burn",
        cards: [makeCard({ id: "a", name: "A", price: 1 }), makeCard({ id: "b", name: "B", price: 2 })],
      }),
      makeDeck({ id: "d2", name: "Other", cards: [makeCard({ id: "a", name: "A", price: 1 })] }),
    ],
  });

  it("updates prices on matching cards and stamps pricesUpdatedAt", () => {
    const state = deckReducer(base(), {
      type: "SET_DECK_PRICES",
      payload: { deckId: "d1", prices: { a: 9.5, b: 3 }, updatedAt: 1000 },
    });
    expect(state.decks[0].cards.map(c => c.price)).toEqual([9.5, 3]);
    expect(state.decks[0].pricesUpdatedAt).toBe(1000);
  });

  it("keeps the prior price for cards absent from the map", () => {
    const state = deckReducer(base(), {
      type: "SET_DECK_PRICES",
      payload: { deckId: "d1", prices: { a: 7 }, updatedAt: 1000 },
    });
    expect(state.decks[0].cards.map(c => c.price)).toEqual([7, 2]);
  });

  it("clears the price when the map value is null", () => {
    const state = deckReducer(base(), {
      type: "SET_DECK_PRICES",
      payload: { deckId: "d1", prices: { a: null }, updatedAt: 1000 },
    });
    expect(state.decks[0].cards[0].price).toBeUndefined();
  });

  it("does not change pricesUpdatedAt when updatedAt is omitted (partial failure)", () => {
    const initial = base();
    initial.decks[0].pricesUpdatedAt = 500;
    const state = deckReducer(initial, {
      type: "SET_DECK_PRICES",
      payload: { deckId: "d1", prices: { a: 4 } },
    });
    expect(state.decks[0].pricesUpdatedAt).toBe(500);
    expect(state.decks[0].cards[0].price).toBe(4);
  });

  it("leaves other decks untouched", () => {
    const state = deckReducer(base(), {
      type: "SET_DECK_PRICES",
      payload: { deckId: "d1", prices: { a: 99 }, updatedAt: 1000 },
    });
    expect(state.decks[1].cards[0].price).toBe(1);
    expect(state.decks[1].pricesUpdatedAt).toBeUndefined();
  });

  it("preserves card source, acquired state and quantity", () => {
    const initial = {
      errors: {},
      decks: [makeDeck({ id: "d1", name: "X", cards: [makeCard({ id: "a", name: "A", source: "need_to_buy", quantity: 3, acquired: true })] })],
    };
    const state = deckReducer(initial, {
      type: "SET_DECK_PRICES",
      payload: { deckId: "d1", prices: { a: 5 }, updatedAt: 1 },
    });
    expect(state.decks[0].cards[0]).toMatchObject({ source: "need_to_buy", quantity: 3, acquired: true, price: 5 });
  });
});

// ── Commander designation ─────────────────────────────────────────────────────

describe("TOGGLE_COMMANDER", () => {
  const cards = [
    makeCard({ id: "c1", name: "A" }), makeCard({ id: "c2", name: "B" }),
    makeCard({ id: "c3", name: "C" }), makeCard({ id: "c4", name: "Four", quantity: 4 }),
  ];
  const toggle = (state: DeckState, cardId: string) =>
    deckReducer(state, { type: "TOGGLE_COMMANDER", payload: { deckId: "d1", cardId } });
  const base = () => ({ errors: {}, decks: [makeDeck({ id: "d1", name: "D", cards })] });

  it("adds and removes a commander", () => {
    const on = toggle(base(), "c1");
    expect(on.decks[0].commanderIds).toEqual(["c1"]);
    expect(toggle(on, "c1").decks[0].commanderIds).toEqual([]);
  });

  it("caps at two commanders", () => {
    const s = toggle(toggle(toggle(base(), "c1"), "c2"), "c3");
    expect(s.decks[0].commanderIds).toEqual(["c1", "c2"]);
  });

  it("still allows removing at the cap", () => {
    const s = toggle(toggle(toggle(base(), "c1"), "c2"), "c1");
    expect(s.decks[0].commanderIds).toEqual(["c2"]);
  });

  it("ignores quantity above 1 and unknown cards", () => {
    expect(toggle(base(), "c4").decks[0].commanderIds).toBeUndefined();
    expect(toggle(base(), "nope").decks[0].commanderIds).toBeUndefined();
  });

  it("REMOVE_CARD drops the id from commanderIds", () => {
    const s = deckReducer(toggle(base(), "c1"), { type: "REMOVE_CARD", payload: { deckId: "d1", cardId: "c1" } });
    expect(s.decks[0].commanderIds).toEqual([]);
  });

  it("SET_CARDS prunes commander ids no longer present", () => {
    const s = deckReducer(toggle(base(), "c1"), { type: "SET_CARDS", payload: { deckId: "d1", cards: [cards[1]] } });
    expect(s.decks[0].commanderIds).toEqual([]);
  });
});

describe("DISMISS_COMMANDER_PROMPT", () => {
  it("sets the flag", () => {
    const s = deckReducer({ errors: {}, decks: [makeDeck({ id: "d1", name: "D" })] }, { type: "DISMISS_COMMANDER_PROMPT", payload: { deckId: "d1" } });
    expect(s.decks[0].commanderPromptDismissed).toBe(true);
  });
});

describe("SET_DECK_BUILT", () => {
  const cards = [
    makeCard({ id: "c1", name: "Bolt", quantity: 2, source: "ordered" }),
    makeCard({ id: "c2", name: "Fake", source: "proxy", manuallyTagged: true }),
    makeCard({ id: "c3", name: "Ponder", source: "in_binder", manuallyTagged: true }),
  ];
  const initial = () => ({ errors: {}, decks: [makeDeck({ id: "d1", name: "Burn", cards }), makeDeck({ id: "d2", name: "Other", cards })] });

  it("marking applies the Built rule to that deck only", () => {
    const s = deckReducer(initial(), { type: "SET_DECK_BUILT", payload: { deckId: "d1", built: true, collection: {} } });
    expect(s.decks[0].isBuilt).toBe(true);
    expect(s.decks[0].cards.map(c => [c.acquired, c.source])).toEqual([[true, "owned"], [true, "proxy"], [true, "owned"]]);
    expect(s.decks[1].cards).toEqual(cards);
  });

  it("marking keeps borrowed cards borrowed", () => {
    const deck = makeDeck({ id: "d1", name: "Burn", cards: [makeCard({ id: "c1", name: "Bolt", source: "borrowed" })] });
    const s = deckReducer({ errors: {}, decks: [deck] }, { type: "SET_DECK_BUILT", payload: { deckId: "d1", built: true, collection: {} } });
    expect(s.decks[0].cards[0]).toMatchObject({ acquired: true, source: "borrowed", manuallyTagged: true });
  });

  it("unmarking clears checkboxes and tags, then re-tags from the Collection", () => {
    const built = deckReducer(initial(), { type: "SET_DECK_BUILT", payload: { deckId: "d1", built: true, collection: {} } });
    const s = deckReducer(built, {
      type: "SET_DECK_BUILT",
      payload: { deckId: "d1", built: false, collection: { bolt: [{ quantity: 2 }], fake: [{ quantity: 0 }] } },
    });
    expect(s.decks[0].isBuilt).toBe(false);
    expect(s.decks[0].cards.map(c => [c.acquired, c.source, c.manuallyTagged])).toEqual([
      [false, "owned", false],
      [false, undefined, false],
      [false, undefined, false],
    ]);
  });
});

// ── Deck errors ───────────────────────────────────────────────────────────────

describe("Deck errors", () => {
  const bolt = { originalName: "Lightnig Bolt", searchName: "Lightnig Bolt", resolved: false, count: 2 };
  const other = { originalName: "Sol Rnig", searchName: "Sol Rnig", resolved: false };
  const withErrors = (): DeckState => ({
    decks: [makeDeck({ id: "d1", name: "Burn" }), makeDeck({ id: "d2", name: "Other" })],
    errors: { d1: [bolt, other], d2: [other] },
  });

  it("ADD_DECK queues the new deck's errors", () => {
    const s = deckReducer({ errors: {}, decks: [] }, { type: "ADD_DECK", payload: makeDeck({ id: "d1", name: "Burn" }), errors: [bolt] });
    expect(s.errors).toEqual({ d1: [bolt] });
  });

  it("ADD_DECK without errors leaves the errors alone", () => {
    const initial = withErrors();
    const s = deckReducer(initial, { type: "ADD_DECK", payload: makeDeck({ id: "d3", name: "New" }) });
    expect(s.errors).toBe(initial.errors);
  });

  it("DELETE_DECK drops the deck's errors with the deck", () => {
    const s = deckReducer(withErrors(), { type: "DELETE_DECK", payload: "d1" });
    expect(s.decks.map(d => d.id)).toEqual(["d2"]);
    expect(s.errors).toEqual({ d2: [other] });
  });

  it("REMAP_DECK_ERROR with a card adds it and resolves the error", () => {
    const card = makeCard({ id: "c1", name: "Lightning Bolt", quantity: 2 });
    const s = deckReducer(withErrors(), {
      type: "REMAP_DECK_ERROR",
      payload: { deckId: "d1", originalName: "Lightnig Bolt", searchName: "Lightning Bolt", card },
    });
    expect(s.decks[0].cards).toEqual([card]);
    expect(s.errors.d1).toEqual([{ ...bolt, searchName: "Lightning Bolt", resolved: true }, other]);
    expect(s.errors.d2).toEqual([other]);
  });

  it("REMAP_DECK_ERROR without a card records the search name and keeps the error queued", () => {
    const s = deckReducer(withErrors(), {
      type: "REMAP_DECK_ERROR",
      payload: { deckId: "d1", originalName: "Lightnig Bolt", searchName: "Lightning Blot" },
    });
    expect(s.decks[0].cards).toEqual([]);
    expect(s.errors.d1[0]).toEqual({ ...bolt, searchName: "Lightning Blot" });
  });

  it("REMAP_DECK_ERROR for a deleted deck does nothing", () => {
    const initial = deckReducer(withErrors(), { type: "DELETE_DECK", payload: "d1" });
    const s = deckReducer(initial, {
      type: "REMAP_DECK_ERROR",
      payload: { deckId: "d1", originalName: "Lightnig Bolt", searchName: "Lightning Bolt", card: makeCard({ id: "c1", name: "Lightning Bolt" }) },
    });
    expect(s).toBe(initial);
    expect("d1" in s.errors).toBe(false);
  });

  it("DISMISS_DECK_ERROR resolves only that error", () => {
    const s = deckReducer(withErrors(), { type: "DISMISS_DECK_ERROR", payload: { deckId: "d1", originalName: "Sol Rnig" } });
    expect(s.errors.d1).toEqual([bolt, { ...other, resolved: true }]);
    expect(s.errors.d2).toEqual([other]);
  });

  it("DISMISS_DECK_ERROR for a deck with no errors does nothing", () => {
    const initial = withErrors();
    const s = deckReducer(initial, { type: "DISMISS_DECK_ERROR", payload: { deckId: "gone", originalName: "Sol Rnig" } });
    expect(s.errors).toBe(initial.errors);
  });
});
