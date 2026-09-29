import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OfferPanel } from "../components/OfferPanel";
import { DEFAULT_SETTINGS, type TradeCard, type TradeSide } from "../../../types/trade";
import { sideTotals } from "../../../utils/tradePricing";

const card = (over: Partial<TradeCard> = {}): TradeCard => ({
  id: "c1", name: "Sol Ring", scryfallId: "s1", set: "cmm", collectorNumber: "410",
  finish: "nonfoil", condition: "NM", quantity: 1, basePrice: 10, priceFetchedAt: Date.now(),
  source: "search", ...over,
});

function setup(over: Partial<React.ComponentProps<typeof OfferPanel>> = {}, data?: TradeSide) {
  const side: TradeSide = data ?? { cards: [card()], cash: [] };
  const props = {
    side: "mine" as const,
    data: side,
    totals: sideTotals(side, DEFAULT_SETTINGS),
    settings: DEFAULT_SETTINGS,
    readOnly: false,
    staleIds: new Set<string>(),
    flashId: null,
    getOwned: () => null,
    onAddFromCollection: vi.fn(),
    onAddSearch: vi.fn(),
    onUpdateCard: vi.fn(),
    onRemoveCard: vi.fn(),
    onChangeFinish: vi.fn(),
    onSetSideDiscount: vi.fn(),
    onSetSideCondition: vi.fn(),
    onUpdateCash: vi.fn(),
    onRemoveCash: vi.fn(),
    ...over,
  };
  const utils = render(<OfferPanel {...props} />);
  return { props, ...utils };
}

describe("OfferPanel", () => {
  it("shows the card, the side count and the discounted subtotal", () => {
    setup({}, { cards: [card({ quantity: 2 })], cash: [] });
    expect(screen.getByText("Sol Ring")).toBeInTheDocument();
    expect(screen.getByText("2 cards")).toBeInTheDocument();
    expect(screen.getByTestId("subtotal-mine")).toHaveTextContent("$18.00"); // 10 × 0.9 × 2
  });

  it("shows an empty state when the side has nothing", () => {
    setup({ side: "theirs" }, { cards: [], cash: [] });
    expect(screen.getByText("Nothing requested yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /From collection/ })).not.toBeInTheDocument();
  });

  it("offers From collection on My side", () => {
    setup();
    expect(screen.getByRole("button", { name: /From collection/ })).toBeInTheDocument();
  });

  it("wires the add buttons", async () => {
    const { props } = setup();
    await userEvent.click(screen.getByRole("button", { name: /From collection/ }));
    await userEvent.click(screen.getByRole("button", { name: /Search cards/ }));
    expect(props.onAddFromCollection).toHaveBeenCalledTimes(1);
    expect(props.onAddSearch).toHaveBeenCalledTimes(1);
  });

  describe("row editing", () => {
    it("steps quantity", async () => {
      const { props } = setup();
      await userEvent.click(screen.getByRole("button", { name: "Increase quantity of Sol Ring" }));
      expect(props.onUpdateCard).toHaveBeenCalledWith("c1", { quantity: 2 });
    });

    it("disables the minus at 1", () => {
      setup();
      expect(screen.getByRole("button", { name: "Decrease quantity of Sol Ring" })).toBeDisabled();
    });

    it("caps a collection card at the owned quantity", async () => {
      const { props } = setup(
        { getOwned: () => ({ owned: 2, inDecks: 0 }) },
        { cards: [card({ source: "collection", quantity: 2 })], cash: [] }
      );
      expect(screen.getByRole("button", { name: "Increase quantity of Sol Ring" })).toBeDisabled();
      expect(screen.getByText("/2")).toBeInTheDocument();
      const input = screen.getByRole("textbox", { name: "Quantity of Sol Ring" });
      await userEvent.clear(input);
      await userEvent.type(input, "9{Enter}");
      expect(props.onUpdateCard).toHaveBeenCalledWith("c1", { quantity: 2 });
    });

    it("does not cap a search card even when the collection has a match", () => {
      setup({ getOwned: () => ({ owned: 1, inDecks: 0 }) }, { cards: [card({ source: "search", quantity: 1 })], cash: [] });
      expect(screen.getByRole("button", { name: "Increase quantity of Sol Ring" })).toBeEnabled();
    });

    it("commits a typed quantity once, on Enter", async () => {
      const { props } = setup();
      const input = screen.getByRole("textbox", { name: "Quantity of Sol Ring" });
      await userEvent.clear(input);
      await userEvent.type(input, "12{Enter}");
      expect(props.onUpdateCard).toHaveBeenCalledTimes(1);
      expect(props.onUpdateCard).toHaveBeenCalledWith("c1", { quantity: 12 });
    });

    it("changes condition", async () => {
      const { props } = setup();
      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Condition for Sol Ring" }), "LP");
      expect(props.onUpdateCard).toHaveBeenCalledWith("c1", { condition: "LP" });
    });

    it("routes a finish change to the page (which re-prices it)", async () => {
      const { props } = setup();
      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Finish for Sol Ring" }), "foil");
      expect(props.onChangeFinish).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }), "foil");
      expect(props.onUpdateCard).not.toHaveBeenCalled();
    });

    it("removes from the row menu", async () => {
      const { props } = setup();
      await userEvent.click(screen.getByRole("button", { name: "More actions for Sol Ring" }));
      await userEvent.click(screen.getByRole("menuitem", { name: /Remove/ }));
      expect(props.onRemoveCard).toHaveBeenCalledWith("c1");
    });
  });

  describe("pricing popovers", () => {
    it("shows the price breakdown with condition and discount", async () => {
      setup({}, { cards: [card({ condition: "LP" })], cash: [] });
      await userEvent.click(screen.getByRole("button", { name: "Price breakdown for Sol Ring" }));
      const bd = screen.getByRole("dialog", { name: "Price breakdown" });
      expect(within(bd).getByText("×0.90")).toBeInTheDocument();
      expect(within(bd).getByText("−10%")).toBeInTheDocument();
      expect(within(bd).getByText("$8.10")).toBeInTheDocument(); // 10 × 0.9 × 0.9
    });

    it("applies a per-card discount override", async () => {
      const { props } = setup();
      await userEvent.click(screen.getByRole("button", { name: "More actions for Sol Ring" }));
      await userEvent.click(screen.getByRole("menuitem", { name: /Override discount/ }));
      const input = screen.getByRole("textbox", { name: "Discount percent" });
      await userEvent.clear(input);
      await userEvent.type(input, "25{Enter}");
      expect(props.onUpdateCard).toHaveBeenCalledWith("c1", { discountOverridePct: 25 });
    });

    it("clears a card override back to the inherited discount", async () => {
      const { props } = setup({}, { cards: [card({ discountOverridePct: 25 })], cash: [] });
      await userEvent.click(screen.getByRole("button", { name: /−25% card/ }));
      await userEvent.click(screen.getByRole("button", { name: "Use 10%" }));
      expect(props.onUpdateCard).toHaveBeenCalledWith("c1", { discountOverridePct: undefined });
    });

    it("sets a manual price and previews the discounted value", async () => {
      const { props } = setup();
      await userEvent.click(screen.getByRole("button", { name: "More actions for Sol Ring" }));
      await userEvent.click(screen.getByRole("menuitem", { name: /Set manual price/ }));
      await userEvent.type(screen.getByRole("textbox", { name: "Manual price in dollars" }), "20");
      expect(screen.getByText(/Counts as/)).toHaveTextContent("$18.00");
      await userEvent.click(screen.getByRole("button", { name: "Apply" }));
      expect(props.onUpdateCard).toHaveBeenCalledWith("c1", { manualPrice: 20 });
    });

    it("blocks Apply on an empty manual price", async () => {
      setup();
      await userEvent.click(screen.getByRole("button", { name: "More actions for Sol Ring" }));
      await userEvent.click(screen.getByRole("menuitem", { name: /Set manual price/ }));
      expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    });

    it("closes a popover on Escape", async () => {
      setup();
      await userEvent.click(screen.getByRole("button", { name: "Price breakdown for Sol Ring" }));
      expect(screen.getByRole("dialog", { name: "Price breakdown" })).toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("dialog", { name: "Price breakdown" })).not.toBeInTheDocument();
    });
  });

  describe("flags", () => {
    it("flags a card with no price, counts it as $0 and offers Set price", async () => {
      const { props } = setup({}, { cards: [card({ basePrice: null })], cash: [] });
      expect(screen.getByText("No price")).toBeInTheDocument();
      expect(screen.getByText("1 without price")).toBeInTheDocument();
      expect(screen.getByTestId("subtotal-mine")).toHaveTextContent("$0.00");
      await userEvent.click(screen.getByRole("button", { name: "Set price" }));
      expect(screen.getByRole("dialog", { name: "Manual price" })).toBeInTheDocument();
      expect(props.onUpdateCard).not.toHaveBeenCalled();
    });

    it("marks a stale row", () => {
      setup({ staleIds: new Set(["c1"]) });
      expect(screen.getByText("Stale")).toBeInTheDocument();
    });

    it("shows how many copies are committed to decks, without blocking", () => {
      setup({ getOwned: () => ({ owned: 3, inDecks: 2 }) });
      expect(screen.getByText("2 in decks")).toBeInTheDocument();
    });

    it("shows the Manual chip for a manually priced card", () => {
      setup({}, { cards: [card({ manualPrice: 5 })], cash: [] });
      expect(screen.getByRole("button", { name: /Manual/ })).toBeInTheDocument();
    });
  });

  describe("side controls", () => {
    it("sets a side-wide discount", async () => {
      const { props } = setup();
      await userEvent.click(screen.getByRole("button", { name: "−10%" }));
      const input = screen.getByRole("textbox", { name: "Discount percent" });
      await userEvent.clear(input);
      await userEvent.type(input, "5");
      await userEvent.click(screen.getByRole("button", { name: "Apply" }));
      expect(props.onSetSideDiscount).toHaveBeenCalledWith(5);
    });

    it("shows and clears an existing side override", async () => {
      const { props } = setup({}, { cards: [card()], cash: [], discountOverridePct: 15 });
      await userEvent.click(screen.getByRole("button", { name: /−15% this side/ }));
      await userEvent.click(screen.getByRole("button", { name: "Use 10%" }));
      expect(props.onSetSideDiscount).toHaveBeenCalledWith(undefined);
    });

    it("applies one condition to the whole side from the header menu", async () => {
      const { props } = setup();
      await userEvent.click(screen.getByRole("button", { name: "My offer options" }));
      await userEvent.click(screen.getByRole("button", { name: "MP" }));
      expect(props.onSetSideCondition).toHaveBeenCalledWith("MP");
    });

    it("disables bulk condition on an empty side", async () => {
      setup({}, { cards: [], cash: [] });
      await userEvent.click(screen.getByRole("button", { name: "My offer options" }));
      expect(screen.getByRole("button", { name: "NM" })).toBeDisabled();
    });
  });

  describe("cash lines", () => {
    const withCash: TradeSide = { cards: [], cash: [{ id: "k1", amount: 5 }] };

    it("counts cash at face value, undiscounted", () => {
      setup({}, withCash);
      expect(screen.getByTestId("subtotal-mine")).toHaveTextContent("$5.00");
      expect(screen.queryByText("Nothing offered yet")).not.toBeInTheDocument();
    });

    it("edits the amount on blur and removes the line", async () => {
      const { props } = setup({}, withCash);
      const input = screen.getByRole("textbox", { name: "Cash amount" });
      await userEvent.clear(input);
      await userEvent.type(input, "12.5{Enter}");
      expect(props.onUpdateCash).toHaveBeenCalledWith("k1", 12.5);
      await userEvent.click(screen.getByRole("button", { name: "Remove cash line" }));
      expect(props.onRemoveCash).toHaveBeenCalledWith("k1");
    });
  });

  describe("read-only", () => {
    it("hides every edit control and shows plain values", () => {
      setup({ readOnly: true }, { cards: [card({ quantity: 3, condition: "LP", finish: "foil" })], cash: [{ id: "k1", amount: 5 }] });
      expect(screen.queryByRole("button", { name: /Search cards/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /More actions/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "My offer options" })).not.toBeInTheDocument();
      expect(screen.queryByRole("textbox", { name: "Cash amount" })).not.toBeInTheDocument();
      expect(screen.getByText("×3")).toBeInTheDocument();
      expect(screen.getByText("LP")).toBeInTheDocument();
      expect(screen.getByText("Foil")).toBeInTheDocument();
    });

    it("never shows collection-derived flags", () => {
      setup({ readOnly: true, getOwned: () => ({ owned: 3, inDecks: 2 }) });
      expect(screen.queryByText("2 in decks")).not.toBeInTheDocument();
    });
  });
});
