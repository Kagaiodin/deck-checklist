import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Card, Collection } from "../../../types/index";
import {
  importDecklist, lookupCard, archidektDeckId, archidektToDecklist, fetchArchidektDecklist, EMPTY_DECKLIST_MESSAGE,
} from "../deckImport";

const validateDecklist = vi.hoisted(() => vi.fn());
vi.mock("../../../utils/validator", () => ({ validateDecklist }));

function card(name: string, quantity = 1, extra: Partial<Card> = {}): Card {
  return { id: name, name, quantity, acquired: false, color: [], type: "Instant", ...extra };
}

/** Scryfall finds every requested name except those in `missing`. */
function scryfallFinds({ missing = [] as string[] } = {}) {
  validateDecklist.mockImplementation(async (parsed: { count: number; name: string }[]) => ({
    cards: parsed.filter(p => !missing.includes(p.name)).map(p => card(p.name, p.count)),
    errors: parsed.filter(p => missing.includes(p.name)).map(p => ({ originalName: p.name, searchName: p.name, resolved: false })),
  }));
}

// Braces: a function returned from beforeEach runs as teardown, and mockReset returns the mock.
beforeEach(() => { validateDecklist.mockReset(); });

describe("importDecklist", () => {
  it("throws when no line parses", async () => {
    await expect(importDecklist("\n  \n", { collection: () => ({}) })).rejects.toThrow(EMPTY_DECKLIST_MESSAGE);
    expect(validateDecklist).not.toHaveBeenCalled();
  });

  it("leaves every source unset when the Collection is empty", async () => {
    scryfallFinds();
    const { cards } = await importDecklist("4 Lightning Bolt\n1 Sol Ring", { collection: () => ({}) });
    expect(cards.map(c => [c.name, c.quantity, c.source])).toEqual([["Lightning Bolt", 4, undefined], ["Sol Ring", 1, undefined]]);
  });

  it("tags cards the Collection holds enough of as owned", async () => {
    scryfallFinds();
    const collection: Collection = { "lightning bolt": [{ quantity: 4 }], "sol ring": [{ quantity: 0 }] };
    const { cards } = await importDecklist("4 Lightning Bolt\n1 Sol Ring", { collection: () => collection });
    expect(cards.map(c => c.source)).toEqual(["owned", undefined]);
  });

  it("reads the Collection after the lookup", async () => {
    let collection: Collection = {};
    validateDecklist.mockImplementation(async () => {
      collection = { "sol ring": [{ quantity: 1 }] };
      return { cards: [card("Sol Ring")], errors: [] };
    });
    const { cards } = await importDecklist("1 Sol Ring", { collection: () => collection });
    expect(cards[0].source).toBe("owned");
  });

  it("strips Moxfield set codes and foil markers before the lookup", async () => {
    scryfallFinds();
    await importDecklist("1 Sol Ring (SLD) 912 *F*", { collection: () => ({}) });
    expect(validateDecklist.mock.calls[0][0]).toEqual([{ count: 1, name: "Sol Ring" }]);
  });

  it("returns unmatched lines as Deck errors", async () => {
    scryfallFinds({ missing: ["Lightnig Bolt"] });
    const { cards, errors } = await importDecklist("4 Lightnig Bolt\n1 Sol Ring", { collection: () => ({}) });
    expect(cards.map(c => c.name)).toEqual(["Sol Ring"]);
    expect(errors).toEqual([{ originalName: "Lightnig Bolt", searchName: "Lightnig Bolt", resolved: false }]);
  });

  it("reports progress", async () => {
    scryfallFinds();
    const onProgress = vi.fn();
    await importDecklist("1 Sol Ring", { collection: () => ({}), onProgress });
    expect(validateDecklist.mock.calls[0][1]).toBe(onProgress);
  });
});

describe("lookupCard", () => {
  it("returns the card with the given count, tagged from the Collection", async () => {
    scryfallFinds();
    const found = await lookupCard({ name: "Sol Ring", count: 2 }, { collection: () => ({ "sol ring": [{ quantity: 2 }] }) });
    expect(found).toMatchObject({ name: "Sol Ring", quantity: 2, source: "owned" });
  });

  it("returns null when Scryfall has no match", async () => {
    scryfallFinds({ missing: ["Nope"] });
    expect(await lookupCard({ name: "Nope", count: 1 }, { collection: () => ({}) })).toBeNull();
  });
});

describe("Archidekt", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("finds the deck id in a deck URL", () => {
    expect(archidektDeckId("https://archidekt.com/decks/365563/elves")).toBe("365563");
    expect(archidektDeckId("ARCHIDEKT.com/decks/42")).toBe("42");
    expect(archidektDeckId("https://moxfield.com/decks/abc")).toBeNull();
  });

  const deck = {
    name: "Elves",
    cards: [
      { quantity: 1, categories: ["Commander"], card: { oracleCard: { name: "Selvala" } } },
      { quantity: 3, categories: ["Maybeboard"], card: { oracleCard: { name: "Llanowar Elves" } } },
      { quantity: 10, categories: null, card: { oracleCard: { name: "Forest" } } },
    ],
  };

  it("maps a deck to a Decklist without the Maybeboard", () => {
    expect(archidektToDecklist(deck)).toEqual({ decklist: "1 Selvala\n10 Forest", name: "Elves" });
    expect(archidektToDecklist({ cards: [] }).name).toBe("");
  });

  it("fetches through the Worker proxy", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => deck }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchArchidektDecklist("42")).resolves.toEqual({ decklist: "1 Selvala\n10 Forest", name: "Elves" });
    expect(fetchMock).toHaveBeenCalledWith("/api/archidekt?id=42");
  });

  it("explains a failed fetch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    await expect(fetchArchidektDecklist("42")).rejects.toThrow("Archidekt returned 404 — is the deck public?");
  });
});
