import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardSearchSheet } from "../components/CardSearchSheet";
import * as scryfall from "../../../utils/scryfallSearch";
import type { Finish } from "../../../types/trade";

vi.mock("../../../utils/scryfallSearch", async (orig) => ({
  ...(await orig<typeof import("../../../utils/scryfallSearch")>()),
  autocomplete: vi.fn(),
  searchPrintings: vi.fn(),
}));

const printing = (over: Partial<scryfall.Printing> = {}): scryfall.Printing => ({
  scryfallId: "p1", name: "Lightning Bolt", set: "2xm", setName: "Double Masters", collectorNumber: "117",
  finishes: ["nonfoil", "foil"] as Finish[], imageUrl: "bolt.jpg", prices: { usd: "1.40", usd_foil: "4.20" }, ...over,
});

const autocompleteMock = vi.mocked(scryfall.autocomplete);
const searchMock = vi.mocked(scryfall.searchPrintings);

beforeEach(() => {
  vi.clearAllMocks();
  autocompleteMock.mockResolvedValue(["Lightning Bolt", "Lightning Helix"]);
  searchMock.mockResolvedValue([
    printing(),
    printing({ scryfallId: "p2", set: "sta", collectorNumber: "42", finishes: ["nonfoil", "foil", "etched"], prices: { usd: "3.50", usd_foil: "9.80", usd_etched: "8.90" } }),
    printing({ scryfallId: "p3", set: "lea", collectorNumber: "161", finishes: ["nonfoil"], prices: {} }),
  ]);
});

const setup = (side: "mine" | "theirs" = "mine") => {
  const onAdd = vi.fn();
  const onClose = vi.fn();
  render(<CardSearchSheet side={side} onAdd={onAdd} onClose={onClose} />);
  return { onAdd, onClose, input: screen.getByRole("combobox") };
};

async function pickBolt(input: HTMLElement) {
  await userEvent.type(input, "light");
  await userEvent.click(await screen.findByRole("option", { name: "Lightning Bolt" }));
  await screen.findByRole("radiogroup", { name: "Printing" });
}

describe("CardSearchSheet", () => {
  it("names the side it adds to", () => {
    setup("theirs");
    expect(screen.getByRole("dialog", { name: "Add to Their offer" })).toBeInTheDocument();
  });

  it("waits for two characters before suggesting", async () => {
    const { input } = setup();
    await userEvent.type(input, "l");
    await new Promise((r) => setTimeout(r, 350));
    expect(autocompleteMock).not.toHaveBeenCalled();
  });

  it("debounces autocomplete and lists suggestions", async () => {
    const { input } = setup();
    await userEvent.type(input, "light");
    expect(await screen.findAllByRole("option")).toHaveLength(2);
    expect(autocompleteMock).toHaveBeenCalledTimes(1); // one call for the settled input, not one per keystroke
    expect(autocompleteMock.mock.calls[0][0]).toBe("light");
  });

  it("loads printings for a chosen suggestion and preselects the first", async () => {
    const { input } = setup();
    await pickBolt(input);
    expect(searchMock).toHaveBeenCalledWith("Lightning Bolt");
    expect(screen.getByText("Printing · 3 found")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /2XM 117/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Add card" })).toBeEnabled();
  });

  it("adds the chosen printing with its price for the chosen finish, condition and quantity", async () => {
    const { input, onAdd } = setup();
    await pickBolt(input);
    await userEvent.click(screen.getByRole("radio", { name: /STA 42/ }));
    await userEvent.click(screen.getByRole("button", { name: "Etched" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Condition" }), "LP");
    await userEvent.click(screen.getByRole("button", { name: "Increase" }));
    await userEvent.click(screen.getByRole("button", { name: "Add card" }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      name: "Lightning Bolt", scryfallId: "p2", set: "sta", collectorNumber: "42",
      finish: "etched", condition: "LP", quantity: 2, basePrice: 8.9, source: "search", imageUrl: "bolt.jpg",
    }));
    expect(typeof onAdd.mock.calls[0][0].priceFetchedAt).toBe("number");
  });

  it("shows the condition-adjusted price for the selection", async () => {
    const { input } = setup();
    await pickBolt(input);
    const row = () => within(document.querySelector<HTMLElement>(".tr-pick-row")!);
    expect(row().getByText("$1.40")).toBeInTheDocument(); // NM
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Condition" }), "MP");
    expect(row().getByText("$1.05")).toBeInTheDocument(); // 1.40 × 0.75
  });

  it("disables finishes the printing doesn't come in and falls back to one it does", async () => {
    const { input, onAdd } = setup();
    await pickBolt(input);
    await userEvent.click(screen.getByRole("button", { name: "Foil" }));
    await userEvent.click(screen.getByRole("radio", { name: /LEA 161/ }));
    expect(screen.getByRole("button", { name: "Foil" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Nonfoil" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Add card" }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ finish: "nonfoil", basePrice: null }));
  });

  it("flags a printing with no price", async () => {
    const { input } = setup();
    await pickBolt(input);
    expect(screen.getAllByText("No price").length).toBeGreaterThan(0);
  });

  it("searches the typed name on Enter when nothing is suggested", async () => {
    autocompleteMock.mockResolvedValue([]);
    const { input } = setup();
    await userEvent.type(input, "Lightning Bolt{Enter}");
    await screen.findByRole("radiogroup", { name: "Printing" });
    expect(searchMock).toHaveBeenCalledWith("Lightning Bolt");
  });

  it("navigates suggestions with the arrow keys", async () => {
    const { input } = setup();
    await userEvent.type(input, "light");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await screen.findByRole("radiogroup", { name: "Printing" });
    expect(searchMock).toHaveBeenCalledWith("Lightning Helix");
  });

  it("says when no card matches", async () => {
    searchMock.mockResolvedValue([]);
    const { input } = setup();
    await userEvent.type(input, "Zzzz{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("No card named “Zzzz”.");
    expect(screen.getByRole("button", { name: "Add card" })).toBeDisabled();
  });

  it("reports a Scryfall failure without crashing", async () => {
    searchMock.mockRejectedValue(new Error("Scryfall error 500"));
    const { input } = setup();
    await userEvent.type(input, "Bolt{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't reach Scryfall/);
  });

  it("survives a failed autocomplete", async () => {
    autocompleteMock.mockRejectedValue(new Error("offline"));
    const { input } = setup();
    await userEvent.type(input, "light");
    await new Promise((r) => setTimeout(r, 350));
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add card" })).toBeDisabled();
  });

  it("clears the printings when the query is edited", async () => {
    const { input } = setup();
    await pickBolt(input);
    await userEvent.type(input, "s");
    expect(screen.queryByRole("radiogroup", { name: "Printing" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add card" })).toBeDisabled();
  });

  it("closes on Cancel, the X button and Escape", async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
