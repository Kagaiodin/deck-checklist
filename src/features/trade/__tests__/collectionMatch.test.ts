import { describe, it, expect } from "vitest";
import { ownedFor, collectionEntries } from "../collectionMatch";
import type { Collection, Deck } from "../../../types/index";

const collection: Collection = {
  "sol ring": [
    { quantity: 2, set: "cmm", collectorNumber: "410" },
    { quantity: 1, set: "cmm", collectorNumber: "410", foil: true },
    { quantity: 4, set: "c21", collectorNumber: "263" },
  ],
  "rhystic study": [{ quantity: 1 }],
  "empty entry": [{ quantity: 0, set: "x", collectorNumber: "1" }],
};

const deck = (cards: { name: string; quantity: number; acquired: boolean }[]): Deck =>
  ({ id: "d", name: "D", createdAt: 0, cards: cards.map((c, i) => ({ id: String(i), color: [], type: "", ...c })) }) as Deck;

describe("ownedFor", () => {
  const card = (over = {}) => ({ name: "Sol Ring", set: "cmm", collectorNumber: "410", finish: "nonfoil" as const, ...over });

  it("matches on printing and finish", () => {
    expect(ownedFor(collection, [], card())?.owned).toBe(2);
    expect(ownedFor(collection, [], card({ finish: "foil" }))?.owned).toBe(1);
  });

  it("treats etched like foil for matching", () => {
    expect(ownedFor(collection, [], card({ finish: "etched" }))?.owned).toBe(1);
  });

  it("is case-insensitive on name and set", () => {
    expect(ownedFor(collection, [], card({ name: "SOL RING", set: "CMM" }))?.owned).toBe(2);
  });

  it("is null for a printing the collection doesn't hold", () => {
    expect(ownedFor(collection, [], card({ set: "lea", collectorNumber: "1" }))).toBeNull();
    expect(ownedFor(collection, [], card({ name: "Nope" }))).toBeNull();
  });

  it("doesn't match a name-only collection entry to a specific printing", () => {
    expect(ownedFor(collection, [], { name: "Rhystic Study", set: "pcy", collectorNumber: "45", finish: "nonfoil" })).toBeNull();
  });

  it("sums duplicate printing entries", () => {
    const dup: Collection = { "sol ring": [{ quantity: 1, set: "cmm", collectorNumber: "410" }, { quantity: 2, set: "cmm", collectorNumber: "410" }] };
    expect(ownedFor(dup, [], card())?.owned).toBe(3);
  });

  it("counts acquired deck copies by name and ignores unacquired ones", () => {
    const decks = [
      deck([{ name: "Sol Ring", quantity: 1, acquired: true }, { name: "Island", quantity: 9, acquired: true }]),
      deck([{ name: "sol ring", quantity: 2, acquired: true }, { name: "Sol Ring", quantity: 5, acquired: false }]),
    ];
    expect(ownedFor(collection, decks, card())).toEqual({ owned: 2, inDecks: 3 });
  });
});

describe("collectionEntries", () => {
  it("lists one entry per printing, sorted by name, skipping zero quantities", () => {
    const entries = collectionEntries(collection);
    expect(entries.map((e) => e.name)).toEqual(["rhystic study", "sol ring", "sol ring", "sol ring"]);
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
  });

  it("filters by name substring, ignoring case and padding", () => {
    expect(collectionEntries(collection, "  SOL ").map((e) => e.name)).toEqual(["sol ring", "sol ring", "sol ring"]);
    expect(collectionEntries(collection, "zzz")).toEqual([]);
  });
});
