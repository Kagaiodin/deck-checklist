import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test/renderApp";
import { COLLECTION_KEY, DECKS_KEY, ERRORS_KEY } from "../store/storageKeys";
import type { Card, Deck } from "../types/index";

// App-level: a Deck import creates a deck tagged from the Collection, with its Deck errors queued.

vi.mock("../utils/validator", async importOriginal => ({
  ...(await importOriginal<typeof import("../utils/validator")>()),
  validateDecklist: vi.fn(async (parsed: { count: number; name: string }[]) => ({
    cards: parsed.filter(p => p.name !== "Lightnig Bolt").map((p): Card => (
      { id: p.name, name: p.name, quantity: p.count, acquired: false, color: [], type: "Artifact" }
    )),
    errors: parsed.filter(p => p.name === "Lightnig Bolt").map(p => ({ originalName: p.name, searchName: p.name, resolved: false })),
  })),
  enrichDeckExtraInfo: vi.fn(async () => ({ tokens: [], altPrintings: {} })),
}));

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("importing a Decklist", () => {
  it("creates a deck tagged from the Collection, with its Deck errors queued", async () => {
    const user = userEvent.setup();
    const { stored } = renderApp({ storage: { [COLLECTION_KEY]: JSON.stringify({ "sol ring": [{ quantity: 1 }] }) } });
    // Price backfill runs when the new deck opens; let it fail quietly.
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));

    await user.click(screen.getByTitle("New deck"));
    await user.type(screen.getByPlaceholderText(/4 Lightning Bolt/), "1 Sol Ring\n1 Counterspell\n4 Lightnig Bolt");
    await user.click(screen.getByRole("button", { name: "Import & Validate" }));

    await waitFor(() => expect(stored(DECKS_KEY)).toHaveLength(1));
    const [deck] = stored(DECKS_KEY) as Deck[];
    expect(deck.name).toBe("Deck 1");
    expect(deck.cards.map(c => [c.name, c.source])).toEqual([["Sol Ring", "owned"], ["Counterspell", undefined]]);
    expect(stored(ERRORS_KEY)).toEqual({ [deck.id]: [{ originalName: "Lightnig Bolt", searchName: "Lightnig Bolt", resolved: false }] });
    expect(screen.queryByRole("button", { name: "Import & Validate" })).not.toBeInTheDocument();
  });
});
