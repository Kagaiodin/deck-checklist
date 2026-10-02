import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
