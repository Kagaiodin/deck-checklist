import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ControlPanel } from "../components/ControlPanel";
import { DEFAULT_SETTINGS, type Trade, type TradeCard, type TradeSide } from "../../../types/trade";
import { fairness, isSideEmpty, sideTotals } from "../../../utils/tradePricing";

const card = (over: Partial<TradeCard> = {}): TradeCard => ({
  id: "c1", name: "Sol Ring", scryfallId: "s1", set: "cmm", collectorNumber: "410",
  finish: "nonfoil", condition: "NM", quantity: 1, basePrice: 10, priceFetchedAt: Date.now(),
  source: "search", ...over,
});
const side = (cards: TradeCard[] = [], extra: Partial<TradeSide> = {}): TradeSide => ({ cards, cash: [], ...extra });

function setup(trade: Partial<Trade> = {}, over: Partial<React.ComponentProps<typeof ControlPanel>> = {}) {
  const t: Trade = { mine: side([card()]), theirs: side([card({ id: "c2", name: "Rhystic Study" })]), settings: { ...DEFAULT_SETTINGS }, readOnly: false, ...trade };
  const mine = sideTotals(t.mine, t.settings);
  const theirs = sideTotals(t.theirs, t.settings);
  const props = {
    trade: t,
    mineTotals: mine,
    theirTotals: theirs,
    fairness: fairness(mine.total, theirs.total, t.settings.tolerancePct),
    isNeutral: isSideEmpty(t.mine) || isSideEmpty(t.theirs),
    neutralText: "Add cards to both sides to compare",
    missingPriceCount: mine.missingPriceCount + theirs.missingPriceCount,
    staleCount: 0,
    refreshing: false,
    oldestPriceAt: Date.now() - 3 * 60_000,
    snapshotAt: null,
    canUndo: false,
    canRedo: false,
    onAddBalance: vi.fn(), onAddCash: vi.fn(), onSetSettings: vi.fn(), onRefresh: vi.fn(),
    onJumpToMissing: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn(), onSwap: vi.fn(), onClear: vi.fn(),
    onCopyText: vi.fn(), onShare: vi.fn(),
    ...over,
  };
  render(<ControlPanel {...props} />);
  return props;
}

describe("ControlPanel", () => {
  describe("verdict and totals", () => {
    it("shows both totals with card counts", () => {
      setup({ mine: side([card({ quantity: 2 })]) });
      expect(screen.getByTestId("total-mine")).toHaveTextContent("$18.00");
      expect(screen.getByTestId("total-theirs")).toHaveTextContent("$9.00");
      expect(screen.getByText("2 cards")).toBeInTheDocument();
    });

    it("shows cash in the side sub-line", () => {
      setup({ mine: { cards: [card()], cash: [{ id: "k", amount: 5 }] } });
      expect(screen.getByText("incl. $5.00 cash")).toBeInTheDocument();
      expect(screen.getByTestId("total-mine")).toHaveTextContent("$14.00");
    });

    it("stays neutral when a side is empty", () => {
      setup({ theirs: side() });
      expect(screen.getByText("Add cards")).toBeInTheDocument();
    });

    it("adds a balancing cash line to the lower side", async () => {
      const props = setup({ mine: side([card({ quantity: 5 })]) }); // mine 45 vs theirs 9
      await userEvent.click(screen.getByRole("button", { name: /Add cash line/ }));
      expect(props.onAddBalance).toHaveBeenCalledWith("theirs", 36);
    });

    it("adds an empty cash line to either side", async () => {
      const props = setup();
      await userEvent.click(screen.getByRole("button", { name: /Cash to mine/ }));
      await userEvent.click(screen.getByRole("button", { name: /Cash to theirs/ }));
      expect(vi.mocked(props.onAddCash).mock.calls).toEqual([["mine"], ["theirs"]]);
    });
  });

  describe("settings", () => {
    it("commits a new global discount on Enter, clamped", async () => {
      const props = setup();
      const input = screen.getByRole("textbox", { name: "Global discount percent" });
      await userEvent.clear(input);
      await userEvent.type(input, "95{Enter}");
      expect(props.onSetSettings).toHaveBeenCalledWith({ discountPct: 90 });
    });

    it("commits tolerance on blur", async () => {
      const props = setup();
      const input = screen.getByRole("textbox", { name: "Fairness tolerance percent" });
      await userEvent.clear(input);
      await userEvent.type(input, "15");
      await userEvent.tab();
      expect(props.onSetSettings).toHaveBeenCalledWith({ tolerancePct: 15 });
    });

    it("ignores an unchanged or non-numeric value", async () => {
      const props = setup();
      const input = screen.getByRole("textbox", { name: "Global discount percent" });
      await userEvent.click(input);
      await userEvent.tab();
      await userEvent.clear(input);
      await userEvent.type(input, "abc");
      await userEvent.tab();
      expect(props.onSetSettings).not.toHaveBeenCalled();
    });

    it("summarizes overrides that beat the global discount", () => {
      setup({
        mine: side([card({ discountOverridePct: 5 })], { discountOverridePct: 20 }),
        theirs: side([card({ id: "c2", discountOverridePct: 0 })]),
      });
      expect(screen.getByText("Overridden on 1 side · 2 cards")).toBeInTheDocument();
    });
  });

  describe("price freshness", () => {
    it("shows the oldest snapshot age and refreshes on click", async () => {
      const props = setup();
      expect(screen.getByText("Updated 3 min ago")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: /Refresh prices/ }));
      expect(props.onRefresh).toHaveBeenCalledTimes(1);
    });

    it("marks prices older than an hour as stale", () => {
      setup({}, { oldestPriceAt: Date.now() - 3 * 3_600_000 });
      expect(screen.getByText("Updated 3 hr ago").closest(".tr-fresh")).toHaveClass("tr-fresh--stale");
    });

    it("disables refresh while loading", () => {
      setup({}, { refreshing: true });
      expect(screen.getByText("Refreshing prices…")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Refreshing/ })).toBeDisabled();
    });

    it("reports cards that couldn't refresh and offers Retry", async () => {
      const props = setup({}, { staleCount: 2 });
      expect(screen.getByText("2 cards couldn't refresh · showing last price")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(props.onRefresh).toHaveBeenCalled();
    });

    it("has nothing to refresh on an empty trade", () => {
      setup({ mine: side(), theirs: side() });
      expect(screen.getByText("Prices load as you add cards")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Refresh prices/ })).not.toBeInTheDocument();
    });
  });

  describe("missing prices", () => {
    it("warns and jumps to the first row", async () => {
      const props = setup({ mine: side([card({ basePrice: null })]) });
      expect(screen.getByText("1 card has no price")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Jump to row" }));
      expect(props.onJumpToMissing).toHaveBeenCalled();
    });

    it("pluralizes", () => {
      setup({ mine: side([card({ basePrice: null }), card({ id: "c3", basePrice: null })]) });
      expect(screen.getByText("2 cards have no price")).toBeInTheDocument();
    });

    it("shows nothing when every card is priced", () => {
      setup();
      expect(screen.queryByText(/no price/)).not.toBeInTheDocument();
    });
  });

  describe("edit tools", () => {
    it("disables undo/redo until there is history", () => {
      setup();
      expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
    });

    it("fires undo, redo, swap and clear", async () => {
      const props = setup({}, { canUndo: true, canRedo: true });
      await userEvent.click(screen.getByRole("button", { name: "Undo" }));
      await userEvent.click(screen.getByRole("button", { name: "Redo" }));
      await userEvent.click(screen.getByRole("button", { name: /Swap sides/ }));
      await userEvent.click(screen.getByRole("button", { name: /Clear trade/ }));
      expect(props.onUndo).toHaveBeenCalled();
      expect(props.onRedo).toHaveBeenCalled();
      expect(props.onSwap).toHaveBeenCalled();
      expect(props.onClear).toHaveBeenCalled();
    });

    it("disables swap, clear, copy and share on an empty trade", () => {
      setup({ mine: side(), theirs: side() });
      for (const name of [/Swap sides/, /Clear trade/, /Copy as text/, /Share link/]) {
        expect(screen.getByRole("button", { name })).toBeDisabled();
      }
    });

    it("counts a cash-only side as non-empty", () => {
      setup({ mine: { cards: [], cash: [{ id: "k", amount: 5 }] }, theirs: side() });
      expect(screen.getByRole("button", { name: /Clear trade/ })).toBeEnabled();
    });
  });

  describe("sharing", () => {
    it("copies text and shares a link", async () => {
      const props = setup();
      await userEvent.click(screen.getByRole("button", { name: /Copy as text/ }));
      await userEvent.click(screen.getByRole("button", { name: /Share link/ }));
      expect(props.onCopyText).toHaveBeenCalled();
      expect(props.onShare).toHaveBeenCalled();
    });
  });

  describe("read-only", () => {
    const shared = () => setup({ readOnly: true, mine: side([card({ quantity: 5 })]) }, { snapshotAt: Date.UTC(2026, 8, 26, 16, 12) });

    it("shows the snapshot line instead of freshness controls", () => {
      shared();
      expect(screen.getByText(/Snapshot · prices as of/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Refresh/ })).not.toBeInTheDocument();
    });

    it("hides settings, edit tools, cash adds and Share link but keeps Copy as text", () => {
      shared();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Swap sides/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Cash to/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Share link/ })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Copy as text/ })).toBeEnabled();
    });

    it("shows the balancing hint without the add-cash action", () => {
      shared();
      expect(screen.getByText(/to even it out/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Add cash line/ })).not.toBeInTheDocument();
    });

    it("doesn't offer Jump to row on a shared trade", () => {
      setup({ readOnly: true, mine: side([card({ basePrice: null })]) });
      expect(screen.getByText("1 card has no price")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Jump to row" })).not.toBeInTheDocument();
    });
  });
});
