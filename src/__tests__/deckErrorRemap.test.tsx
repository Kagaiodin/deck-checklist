import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test/renderApp";
import { COLLECTION_KEY, DECKS_KEY, ERRORS_KEY } from "../store/storageKeys";
import type { Card, Deck, ErrorQueueItem } from "../types/index";

// App-level: remapping a Deck error adds the card it names to the deck.

const validateDecklist = vi.hoisted(() => vi.fn());
vi.mock("../utils/validator", async importOriginal => ({
  ...(await importOriginal<typeof import("../utils/validator")>()),
  validateDecklist,
}));

const card = (name: string, quantity = 1): Card => ({ id: name, name, quantity, acquired: false, color: [], type: "Instant" });

function seed({ errors, collection = {} }: { errors: ErrorQueueItem[]; collection?: object }) {
  const deck: Deck = { id: "d1", name: "Burn", cards: [card("Sol Ring")], createdAt: 1, pricesUpdatedAt: Date.now() };
  return {
    [DECKS_KEY]: JSON.stringify([deck]),
    [ERRORS_KEY]: JSON.stringify({ d1: errors }),
    [COLLECTION_KEY]: JSON.stringify(collection),
  };
}

async function startRemap(user: ReturnType<typeof userEvent.setup>, to: string) {
  await user.click(screen.getAllByText("Burn")[0]);
  await user.click(screen.getByRole("button", { name: "Remap" }));
  const input = screen.getByDisplayValue(/Lightnig Bolt/);
  await user.clear(input);
  await user.type(input, to);
  await user.click(screen.getByRole("button", { name: "Remap" }));
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  validateDecklist.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("remapping a Deck error", () => {
  it("keeps changes made to the deck while the lookup runs", async () => {
    let finish!: () => void;
    validateDecklist.mockImplementation((parsed: { count: number; name: string }[]) =>
      new Promise(resolve => { finish = () => resolve({ cards: parsed.map(p => card(p.name, p.count)), errors: [] }); }));
    const user = userEvent.setup();
    const { stored } = renderApp({ storage: seed({ errors: [{ originalName: "Lightnig Bolt", searchName: "Lightnig Bolt", resolved: false }] }) });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));

    await startRemap(user, "Lightning Bolt");
    await waitFor(() => expect(validateDecklist).toHaveBeenCalled());
    await user.click(screen.getByRole("checkbox", { name: "Mark Sol Ring acquired" }));
    finish();

    await waitFor(() => expect((stored(DECKS_KEY) as Deck[])[0].cards).toHaveLength(2));
    const cards = (stored(DECKS_KEY) as Deck[])[0].cards;
    expect(cards.map(c => [c.name, c.acquired])).toEqual([["Sol Ring", true], ["Lightning Bolt", false]]);
  });
});
