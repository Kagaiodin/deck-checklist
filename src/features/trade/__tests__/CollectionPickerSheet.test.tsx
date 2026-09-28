import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollectionPickerSheet } from "../components/CollectionPickerSheet";
import * as scryfall from "../../../utils/scryfallSearch";
import type { Collection, Deck } from "../../../types/index";

vi.mock("../../../utils/scryfallSearch", async (orig) => ({
  ...(await orig<typeof import("../../../utils/scryfallSearch")>()),
  fetchPrices: vi.fn(),
  searchPrintings: vi.fn(),
}));

const fetchPricesMock = vi.mocked(scryfall.fetchPrices);
const searchMock = vi.mocked(scryfall.searchPrintings);

const printing = (over: Partial<scryfall.Printing> = {}): scryfall.Printing => ({
  scryfallId: "p1", name: "Sol Ring", set: "cmm", setName: "Commander Masters", collectorNumber: "410",
  finishes: ["nonfoil", "foil"], imageUrl: "sol.jpg", prices: { usd: "1.60", usd_foil: "4.00" }, ...over,
});

const collection: Collection = {
  "sol ring": [{ quantity: 4, set: "cmm", collectorNumber: "410" }, { quantity: 1, set: "cmm", collectorNumber: "410", foil: true }],
  "rhystic study": [{ quantity: 1 }],
  "fable of the mirror-breaker": [{ quantity: 2, set: "neo", collectorNumber: "141" }],
};

const decks = [{ id: "d", name: "Deck", createdAt: 0, cards: [{ id: "1", name: "Sol Ring", quantity: 3, acquired: true, color: [], type: "" }] }] as Deck[];

beforeEach(() => {
  vi.clearAllMocks();
  fetchPricesMock.mockResolvedValue(new Map([["cmm:410", printing()]]));
  searchMock.mockResolvedValue([printing({ name: "Rhystic Study", set: "pcy", collectorNumber: "45", scryfallId: "p9", prices: { usd: "34.00" } })]);
});

const setup = (c: Collection = collection) => {
  const onAdd = vi.fn();
  const onClose = vi.fn();
  render(<CollectionPickerSheet collection={c} decks={decks} onAdd={onAdd} onClose={onClose} />);
  return { onAdd, onClose };
};

describe("CollectionPickerSheet", () => {
  it("lists printings with readable names, finish, owned count and in-decks flag", () => {
    setup();
    expect(screen.getByText("Fable of the Mirror-breaker")).toBeInTheDocument();
    expect(screen.getAllByText("Sol Ring")).toHaveLength(2); // nonfoil + foil printings
    expect(screen.getAllByText("3 in decks")).toHaveLength(2);
    expect(screen.getByText(/Foil · own/)).toBeInTheDocument();
    expect(screen.getByText("Nothing selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to My offer" })).toBeDisabled();
  });

  it("filters by name", async () => {
    setup();
    await userEvent.type(screen.getByRole("textbox", { name: "Filter collection" }), "rhystic");
    expect(screen.getByText("Rhystic Study")).toBeInTheDocument();
    expect(screen.queryByText("Sol Ring")).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Filter collection" }), "zzz");
    expect(screen.getByText(/No cards match/)).toBeInTheDocument();
  });

  it("says so when the collection is empty", () => {
    setup({});
    expect(screen.getByText(/Your collection is empty/)).toBeInTheDocument();
  });

  it("caps the selection at the owned quantity", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Add Fable of the Mirror-breaker" }));
    const plus = screen.getByRole("button", { name: "Increase Fable of the Mirror-breaker" });
    await userEvent.click(plus);
    expect(screen.getByRole("textbox", { name: "Selected Fable of the Mirror-breaker" })).toHaveValue("2");
    expect(plus).toBeDisabled();
  });

  it("steps back down to zero and returns to the Add button", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Add Fable of the Mirror-breaker" }));
    await userEvent.click(screen.getByRole("button", { name: "Decrease Fable of the Mirror-breaker" }));
    expect(screen.getByRole("button", { name: "Add Fable of the Mirror-breaker" })).toBeInTheDocument();
    expect(screen.getByText("Nothing selected")).toBeInTheDocument();
  });

  it("adds selected printings priced by set + collector number, tagged as collection cards", async () => {
    const { onAdd } = setup();
    await userEvent.click(screen.getAllByRole("button", { name: "Add Sol Ring" })[0]);
    await userEvent.click(screen.getByRole("button", { name: "Increase Sol Ring" }));
    expect(screen.getByText("2 cards selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add to My offer" }));
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(fetchPricesMock).toHaveBeenCalledWith([{ set: "cmm", collectorNumber: "410" }]);
    expect(onAdd.mock.calls[0][0]).toEqual([
      expect.objectContaining({ name: "Sol Ring", scryfallId: "p1", set: "cmm", collectorNumber: "410", finish: "nonfoil", condition: "NM", quantity: 2, basePrice: 1.6, source: "collection", imageUrl: "sol.jpg" }),
    ]);
  });

  it("prices a foil printing from the foil price", async () => {
    const { onAdd } = setup();
    // The foil printing is the second Sol Ring row.
    await userEvent.click(screen.getAllByRole("button", { name: "Add Sol Ring" })[1]);
    await userEvent.click(screen.getByRole("button", { name: "Add to My offer" }));
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onAdd.mock.calls[0][0][0]).toMatchObject({ finish: "foil", basePrice: 4 });
  });

  it("resolves a name-only entry to the newest printing of that name", async () => {
    const { onAdd } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Add Rhystic Study" }));
    await userEvent.click(screen.getByRole("button", { name: "Add to My offer" }));
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(searchMock).toHaveBeenCalledWith("rhystic study");
    expect(fetchPricesMock).not.toHaveBeenCalled();
    expect(onAdd.mock.calls[0][0][0]).toMatchObject({ name: "Rhystic Study", set: "pcy", collectorNumber: "45", basePrice: 34, source: "collection" });
  });

  it("still adds a card whose price lookup failed, unpriced, so it can be priced by hand", async () => {
    fetchPricesMock.mockResolvedValue(new Map());
    const { onAdd } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Add Fable of the Mirror-breaker" }));
    await userEvent.click(screen.getByRole("button", { name: "Add to My offer" }));
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onAdd.mock.calls[0][0][0]).toMatchObject({ name: "Fable of the Mirror-breaker", set: "neo", collectorNumber: "141", basePrice: null, priceFetchedAt: null });
  });

  it("closes on Cancel", async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });
});
