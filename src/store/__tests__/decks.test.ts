import { describe, it, expect } from "vitest";
import { deckReducer } from "../decks";
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

const emptyState = { decks: [] };

// ── ADD_DECK ──────────────────────────────────────────────────────────────────

describe("ADD_DECK", () => {
  it("adds a new deck to the list", () => {
    const deck = makeDeck({ id: "d1", name: "Burn" });
    const state = deckReducer(emptyState, { type: "ADD_DECK", payload: deck });
    expect(state.decks).toHaveLength(1);
    expect(state.decks[0].id).toBe("d1");
  });

  it("preserves existing decks", () => {
    const initial = { decks: [makeDeck({ id: "d1", name: "Burn" })] };
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
      decks: [makeDeck({ id: "d1", name: "Burn" }), makeDeck({ id: "d2", name: "Control" })],
    };
    const state = deckReducer(initial, { type: "DELETE_DECK", payload: "d1" });
    expect(state.decks).toHaveLength(1);
    expect(state.decks[0].id).toBe("d2");
  });

  it("does nothing if the id does not exist", () => {
    const initial = { decks: [makeDeck({ id: "d1", name: "Burn" })] };
    const state = deckReducer(initial, { type: "DELETE_DECK", payload: "nope" });
    expect(state.decks).toHaveLength(1);
  });
});

// ── RENAME_DECK ───────────────────────────────────────────────────────────────

describe("RENAME_DECK", () => {
  it("updates the name of the target deck", () => {
    const initial = { decks: [makeDeck({ id: "d1", name: "Old Name" })] };
    const state = deckReducer(initial, {
      type: "RENAME_DECK",
      payload: { id: "d1", name: "New Name" },
    });
    expect(state.decks[0].name).toBe("New Name");
  });

  it("does not affect other decks", () => {
    const initial = {
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
    const initial = { decks: [makeDeck({ id: "d1", name: "Burn" })] };
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
    const initial = { decks: [makeDeck({ id: "d1", name: "Burn", cards: [card] })] };
    const state = deckReducer(initial, {
      type: "TOGGLE_ACQUIRED",
      payload: { deckId: "d1", cardId: "c1" },
    });
    expect(state.decks[0].cards[0].acquired).toBe(true);
  });

  it("flips acquired from true to false", () => {
    const card = makeCard({ id: "c1", name: "Lightning Bolt", acquired: true });
    const initial = { decks: [makeDeck({ id: "d1", name: "Burn", cards: [card] })] };
    const state = deckReducer(initial, {
      type: "TOGGLE_ACQUIRED",
      payload: { deckId: "d1", cardId: "c1" },
    });
    expect(state.decks[0].cards[0].acquired).toBe(false);
  });
});

// ── SET_CARD_SOURCE ───────────────────────────────────────────────────────────

describe("SET_CARD_SOURCE", () => {
  it("sets the source on the target card", () => {
    const card = makeCard({ id: "c1", name: "Lightning Bolt" });
    const initial = { decks: [makeDeck({ id: "d1", name: "Burn", cards: [card] })] };
    const state = deckReducer(initial, {
      type: "SET_CARD_SOURCE",
      payload: { deckId: "d1", cardId: "c1", source: "ordered" },
    });
    expect(state.decks[0].cards[0].source).toBe("ordered");
  });

  it("sets manuallyTagged to true", () => {
    const card = makeCard({ id: "c1", name: "Lightning Bolt" });
    const initial = { decks: [makeDeck({ id: "d1", name: "Burn", cards: [card] })] };
    const state = deckReducer(initial, {
      type: "SET_CARD_SOURCE",
      payload: { deckId: "d1", cardId: "c1", source: "proxy" },
    });
    expect(state.decks[0].cards[0].manuallyTagged).toBe(true);
  });

  it("clears the source when payload source is undefined", () => {
    const card = makeCard({ id: "c1", name: "Lightning Bolt", source: "owned" });
    const initial = { decks: [makeDeck({ id: "d1", name: "Burn", cards: [card] })] };
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
    const initial = { decks: [makeDeck({ id: "d1", name: "Burn", cards })] };
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
    const initial = { decks: [makeDeck({ id: "d1", name: "Burn", cards })] };
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
    const initial = { decks: [makeDeck({ id: "d1", name: "Burn", cards: [card] })] };
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
    const initial = { decks: [makeDeck({ id: "d1", name: "Burn", cards: [card] })] };
    const state = deckReducer(initial, {
      type: "APPLY_COLLECTION",
      payload: { "lightning bolt": [{ quantity: 10 }] },
    });
    expect(state.decks[0].cards[0].source).toBe("proxy"); // unchanged
  });

  it("applies across multiple decks", () => {
    const initial = {
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
    const initial = { decks: [makeDeck({ id: "d1", name: "Burn", cards })] };
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
    const initial = { decks: [makeDeck({ id: "d1", name: "Burn", cards: [card] })] };
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
    const initial = { decks: [makeDeck({ id: "d1", name: "Burn" })] };
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

// ── UNSET_CARD_SOURCES ────────────────────────────────────────────────────────

describe("UNSET_CARD_SOURCES", () => {
  it("clears source and manuallyTagged on the specified cards", () => {
    const cards = [
      makeCard({ id: "c1", name: "Lightning Bolt", source: "ordered", manuallyTagged: true }),
      makeCard({ id: "c2", name: "Lava Spike", source: "owned", manuallyTagged: true }),
    ];
    const initial = { decks: [makeDeck({ id: "d1", name: "Burn", cards })] };
    const state = deckReducer(initial, {
      type: "UNSET_CARD_SOURCES",
      payload: { deckId: "d1", cardIds: ["c1"] },
    });
    expect(state.decks[0].cards[0].source).toBeUndefined();
    expect(state.decks[0].cards[0].manuallyTagged).toBe(false);
    // c2 untouched
    expect(state.decks[0].cards[1].source).toBe("owned");
    expect(state.decks[0].cards[1].manuallyTagged).toBe(true);
  });

  it("does not affect other decks", () => {
    const initial = {
      decks: [
        makeDeck({ id: "d1", name: "Burn", cards: [makeCard({ id: "c1", name: "Lightning Bolt", source: "ordered", manuallyTagged: true })] }),
        makeDeck({ id: "d2", name: "Storm", cards: [makeCard({ id: "c2", name: "Dark Ritual",   source: "ordered", manuallyTagged: true })] }),
      ],
    };
    const state = deckReducer(initial, {
      type: "UNSET_CARD_SOURCES",
      payload: { deckId: "d1", cardIds: ["c1"] },
    });
    expect(state.decks[1].cards[0].source).toBe("ordered"); // d2 untouched
  });
});

// ── ADD_NOTIFICATION ──────────────────────────────────────────────────────────

describe("ADD_NOTIFICATION", () => {
  it("appends a notification to the target deck", () => {
    const initial = { decks: [makeDeck({ id: "d1", name: "Burn" })] };
    const notification = {
      id: "n1",
      type: "order_cancelled" as const,
      orderId: "order1",
      orderLabel: "TCGPlayer — May 15",
      affectedCardIds: ["c1", "c2"],
      createdAt: Date.now(),
    };
    const state = deckReducer(initial, {
      type: "ADD_NOTIFICATION",
      payload: { deckId: "d1", notification },
    });
    expect(state.decks[0].notifications).toHaveLength(1);
    expect(state.decks[0].notifications![0].id).toBe("n1");
  });

  it("appends to existing notifications", () => {
    const existing = { id: "n0", type: "order_cancelled" as const, orderId: "o0", orderLabel: "Old", affectedCardIds: [], createdAt: 0 };
    const initial = { decks: [makeDeck({ id: "d1", name: "Burn", notifications: [existing] })] };
    const state = deckReducer(initial, {
      type: "ADD_NOTIFICATION",
      payload: { deckId: "d1", notification: { id: "n1", type: "order_cancelled", orderId: "o1", orderLabel: "New", affectedCardIds: [], createdAt: 1 } },
    });
    expect(state.decks[0].notifications).toHaveLength(2);
  });
});

// ── DISMISS_NOTIFICATION ──────────────────────────────────────────────────────

describe("DISMISS_NOTIFICATION", () => {
  it("removes the notification with the given id", () => {
    const notifications = [
      { id: "n1", type: "order_cancelled" as const, orderId: "o1", orderLabel: "A", affectedCardIds: [], createdAt: 0 },
      { id: "n2", type: "order_cancelled" as const, orderId: "o2", orderLabel: "B", affectedCardIds: [], createdAt: 1 },
    ];
    const initial = { decks: [makeDeck({ id: "d1", name: "Burn", notifications })] };
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
    const initial = { decks: [makeDeck({ id: "d1", name: "Burn", notifications })] };
    const state = deckReducer(initial, {
      type: "DISMISS_NOTIFICATION",
      payload: { deckId: "d1", notificationId: "nope" },
    });
    expect(state.decks[0].notifications).toHaveLength(1);
  });
});
