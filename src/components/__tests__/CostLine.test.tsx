import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CostLine } from "../CostLine";
import type { Card } from "../../types/index";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-09-30T15:00:00").getTime();

function makeCard(overrides: Partial<Card> & { id: string }): Card {
  return {
    name: overrides.id,
    quantity: 1,
    acquired: false,
    color: [],
    type: "Instant",
    ...overrides,
  };
}

function renderLine(cards: Card[], opts: { pricesUpdatedAt?: number; isLoading?: boolean } = {}) {
  return render(
    <CostLine
      cards={cards}
      pricesUpdatedAt={"pricesUpdatedAt" in opts ? opts.pricesUpdatedAt : NOW - HOUR}
      isLoading={opts.isLoading ?? false}
      now={NOW}
    />
  );
}

describe("CostLine", () => {
  it("shows the remaining cost for missing cards", () => {
    renderLine([
      makeCard({ id: "a", source: "need_to_buy", price: 40, quantity: 2 }),
      makeCard({ id: "b", price: 6 }),
    ]);
    expect(screen.getByText("~$86")).toBeInTheDocument();
    expect(screen.getByText("to finish")).toBeInTheDocument();
  });

  it("does not include est. (the ~ carries the estimate)", () => {
    renderLine([makeCard({ id: "a", source: "need_to_buy", price: 5 })]);
    expect(screen.queryByText(/est\./i)).not.toBeInTheDocument();
  });

  it("notes unpriced and ordered copies", () => {
    renderLine([
      makeCard({ id: "a", source: "need_to_buy", price: 10 }),
      makeCard({ id: "b", source: "need_to_buy", quantity: 2 }),
      makeCard({ id: "c", source: "ordered", price: 3, quantity: 3 }),
    ]);
    expect(screen.getByText(/\+2 unpriced/)).toBeInTheDocument();
    expect(screen.getByText(/3 ordered/)).toBeInTheDocument();
  });

  it("omits the unpriced and ordered notes when there are none", () => {
    renderLine([makeCard({ id: "a", source: "need_to_buy", price: 10 })]);
    expect(screen.queryByText(/unpriced/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ordered/)).not.toBeInTheDocument();
  });

  it("does not count ordered, owned or proxy cards in the total", () => {
    renderLine([
      makeCard({ id: "a", source: "need_to_buy", price: 4 }),
      makeCard({ id: "b", source: "ordered", price: 100 }),
      makeCard({ id: "c", source: "owned", price: 100 }),
      makeCard({ id: "d", source: "proxy", price: 100 }),
    ]);
    expect(screen.getByText("~$4")).toBeInTheDocument();
  });

  it("shows fresh prices as 'as of' without a warning", () => {
    renderLine([makeCard({ id: "a", source: "need_to_buy", price: 4 })]);
    const fresh = screen.getByText(/^Prices as of /);
    expect(fresh).toBeInTheDocument();
    expect(fresh.closest(".cost-stale")).toBeNull();
  });

  it("marks prices older than 24h as stale", () => {
    renderLine([makeCard({ id: "a", source: "need_to_buy", price: 4 })], { pricesUpdatedAt: NOW - 30 * HOUR });
    const stale = screen.getByText(/^Prices from /);
    expect(stale.closest(".cost-stale")).not.toBeNull();
  });

  it("shows a done state when nothing is left to buy", () => {
    renderLine([
      makeCard({ id: "a", source: "owned", acquired: true, price: 4 }),
      makeCard({ id: "b", source: "proxy", price: 4 }),
    ]);
    expect(screen.getByText("Nothing left to buy")).toBeInTheDocument();
    expect(screen.queryByText("to finish")).not.toBeInTheDocument();
  });

  it("keeps the ordered note in the done state", () => {
    renderLine([makeCard({ id: "a", source: "ordered", price: 4, quantity: 2 })]);
    expect(screen.getByText("Nothing left to buy")).toBeInTheDocument();
    expect(screen.getByText(/2 ordered/)).toBeInTheDocument();
  });

  it("shows a loading state while prices are fetched and none exist yet", () => {
    renderLine([makeCard({ id: "a", source: "need_to_buy" })], { isLoading: true, pricesUpdatedAt: undefined });
    expect(screen.getByRole("status")).toHaveTextContent("Loading prices…");
  });

  it("keeps showing existing prices while a refresh is in flight", () => {
    renderLine([makeCard({ id: "a", source: "need_to_buy", price: 12 })], { isLoading: true });
    expect(screen.getByText("~$12")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders nothing when no prices exist and nothing is loading (never a misleading $0)", () => {
    const { container } = renderLine([makeCard({ id: "a", source: "need_to_buy" })], { pricesUpdatedAt: undefined });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for an empty deck", () => {
    const { container } = renderLine([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("never shows an owned-side or whole-deck dollar figure", () => {
    renderLine([
      makeCard({ id: "a", source: "need_to_buy", price: 10 }),
      makeCard({ id: "b", source: "owned", acquired: true, price: 500 }),
    ]);
    expect(screen.queryByText(/\$5\d\d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$510/)).not.toBeInTheDocument();
    expect(screen.queryByText(/owned/i)).not.toBeInTheDocument();
  });

  describe("breakdown popover", () => {
    const mixed = () => [
      makeCard({ id: "a", source: "need_to_buy", price: 10, quantity: 2 }),
      makeCard({ id: "b", price: 4, quantity: 3 }),
    ];
    const trigger = () => screen.getByRole("button", { name: "~$32" });

    it("starts closed with an aria-expanded trigger", () => {
      renderLine(mixed());
      expect(trigger()).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("opens on click and shows the split, header and footer", async () => {
      const user = userEvent.setup();
      renderLine(mixed());
      await user.click(trigger());
      const dialog = screen.getByRole("dialog", { name: "Cost to finish breakdown" });
      expect(trigger()).toHaveAttribute("aria-expanded", "true");
      expect(within(dialog).getByText("5 cards still missing")).toBeInTheDocument();
      expect(within(dialog).getByText("To buy").parentElement).toHaveTextContent("To buy2");
      expect(within(dialog).getByText("~$20")).toBeInTheDocument();
      expect(within(dialog).getByText("Untagged").parentElement).toHaveTextContent("Untagged3");
      expect(within(dialog).getByText("~$12")).toBeInTheDocument();
      expect(within(dialog).getByText(/Scryfall's default printing, in USD/)).toBeInTheDocument();
      expect(within(dialog).getByText(/^Prices as of /)).toBeInTheDocument();
    });

    it("opens with Enter on the focused trigger", async () => {
      const user = userEvent.setup();
      renderLine(mixed());
      await user.tab();
      expect(trigger()).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("closes on Esc and returns focus to the trigger", async () => {
      const user = userEvent.setup();
      renderLine(mixed());
      await user.click(trigger());
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger()).toHaveFocus();
    });

    it("closes on an outside click", async () => {
      const user = userEvent.setup();
      render(<div><button>elsewhere</button><CostLine cards={mixed()} pricesUpdatedAt={NOW - HOUR} isLoading={false} now={NOW} /></div>);
      await user.click(screen.getByRole("button", { name: "~$32" }));
      await user.click(screen.getByRole("button", { name: "elsewhere" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("closes when the trigger is clicked again", async () => {
      const user = userEvent.setup();
      renderLine(mixed());
      await user.click(trigger());
      await user.click(trigger());
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("stays open when clicking inside the popover", async () => {
      const user = userEvent.setup();
      renderLine(mixed());
      await user.click(trigger());
      await user.click(screen.getByText("5 cards still missing"));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("hides the Untagged row when there are none, and the To buy row likewise", async () => {
      const user = userEvent.setup();
      const { unmount } = renderLine([makeCard({ id: "a", source: "need_to_buy", price: 5 })]);
      await user.click(screen.getByRole("button", { name: "~$5" }));
      expect(screen.getByText("To buy")).toBeInTheDocument();
      expect(screen.queryByText("Untagged")).not.toBeInTheDocument();
      unmount();
      renderLine([makeCard({ id: "b", price: 5 })]);
      await user.click(screen.getByRole("button", { name: "~$5" }));
      expect(screen.getByText("Untagged")).toBeInTheDocument();
      expect(screen.queryByText("To buy")).not.toBeInTheDocument();
    });

    it("hides the optional rows when there are no unpriced or ordered copies", async () => {
      const user = userEvent.setup();
      renderLine(mixed());
      await user.click(trigger());
      expect(screen.queryByText("No price found")).not.toBeInTheDocument();
      expect(screen.queryByText("Ordered")).not.toBeInTheDocument();
    });

    it("shows the optional rows when their counts are above 0", async () => {
      const user = userEvent.setup();
      renderLine([
        makeCard({ id: "a", source: "need_to_buy", price: 10 }),
        makeCard({ id: "b", source: "need_to_buy", quantity: 2 }),
        makeCard({ id: "c", source: "ordered", price: 3, quantity: 3 }),
      ]);
      await user.click(screen.getByRole("button", { name: "~$10" }));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("No price found").parentElement).toHaveTextContent("No price found2");
      expect(within(dialog).getByText("counted as $0")).toBeInTheDocument();
      expect(within(dialog).getByText("Ordered").parentElement).toHaveTextContent("Ordered3");
      expect(within(dialog).getByText("not counted")).toBeInTheDocument();
    });

    it("keeps the displayed rows summing to the rounded headline", async () => {
      const user = userEvent.setup();
      // 10.4 + 10.4 = 20.8 -> headline ~$21; naive rows would show ~$10 + ~$10
      renderLine([
        makeCard({ id: "a", source: "need_to_buy", price: 10.4 }),
        makeCard({ id: "b", price: 10.4 }),
      ]);
      await user.click(screen.getByRole("button", { name: "~$21" }));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("~$10")).toBeInTheDocument();
      expect(within(dialog).getAllByText("~$11").length).toBeGreaterThan(0);
    });

    it("renders the stale footer with the warn icon", async () => {
      const user = userEvent.setup();
      renderLine(mixed(), { pricesUpdatedAt: NOW - 30 * HOUR });
      await user.click(trigger());
      const dialog = screen.getByRole("dialog");
      const stale = within(dialog).getByText(/^Couldn't refresh\. Prices from /);
      expect(stale.closest(".cost-stale")).not.toBeNull();
      expect(stale.querySelector("svg")).not.toBeNull();
    });

    it("never shows a deck total or owned value in the popover", async () => {
      const user = userEvent.setup();
      renderLine([...mixed(), makeCard({ id: "o", source: "owned", acquired: true, price: 500 })]);
      await user.click(trigger());
      expect(within(screen.getByRole("dialog")).queryByText(/\$5\d\d/)).not.toBeInTheDocument();
      expect(within(screen.getByRole("dialog")).queryByText(/owned/i)).not.toBeInTheDocument();
    });

    it.each([
      ["loading", [makeCard({ id: "a", source: "need_to_buy" })], { isLoading: true, pricesUpdatedAt: undefined }],
      ["empty (no prices)", [makeCard({ id: "a", source: "need_to_buy" })], { pricesUpdatedAt: undefined }],
      ["done", [makeCard({ id: "a", source: "owned", acquired: true, price: 4 })], {}],
    ])("renders no trigger in the %s state", (_label, cards, opts) => {
      renderLine(cards, opts);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });
});
