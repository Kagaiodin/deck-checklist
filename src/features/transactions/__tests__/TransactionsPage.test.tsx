import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { TransactionsPage, type TransactionsTab } from "../TransactionsPage";
import type { Order } from "../../../types/index";

const order = (id: string): Order => ({
  id, createdAt: Date.now(), vendor: "ManaPool", status: "active",
  cards: [{ cardName: "Sol Ring", quantity: 1 }],
});

const ordersProps = (orders: Order[] = []) => ({
  orders, decks: [], recentVendors: [],
  onCreateOrder: vi.fn(), onUpdateOrder: vi.fn(), onMarkReceived: vi.fn(),
  onMarkCancelled: vi.fn(), onDeleteOrder: vi.fn(),
});

/** Controlled the way App drives it. */
function Harness({ initial = "buys", orders = [] }: { initial?: TransactionsTab; orders?: Order[] }) {
  const [tab, setTab] = useState<TransactionsTab>(initial);
  return <TransactionsPage subTab={tab} onSubTabChange={setTab} ordersProps={ordersProps(orders)} />;
}

beforeEach(() => vi.clearAllMocks());

describe("TransactionsPage", () => {
  it("titles the page Transactions and offers Buys, Trades & sales and Binder", () => {
    render(<Harness orders={[order("a")]} />);
    expect(screen.getByRole("heading", { level: 1, name: "Transactions" })).toBeInTheDocument();
    const tabs = within(screen.getByRole("tablist", { name: "Transactions sections" })).getAllByRole("tab");
    expect(tabs.map(t => t.textContent)).toEqual(["Buys1", "Trades & sales", "Binder"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });

  it("renders the Orders page unchanged under Buys, with a labelled tabpanel", () => {
    render(<Harness orders={[order("a")]} />);
    const panel = screen.getByRole("tabpanel", { name: /Buys/ });
    expect(within(panel).getByRole("button", { name: /Active/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ New order" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Buys/ })).toHaveAttribute("aria-controls", panel.id);
  });

  it("keeps the sub-tabs reachable when there are no orders", async () => {
    render(<Harness />);
    expect(screen.getByText("No orders yet")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Binder" }));
    expect(screen.getByRole("tabpanel", { name: "Binder" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Buys" }));
    expect(screen.getByText("No orders yet")).toBeInTheDocument();
  });

  it("switches sub-tabs and marks only the active one selected", async () => {
    render(<Harness orders={[order("a")]} />);
    await userEvent.click(screen.getByRole("tab", { name: "Trades & sales" }));
    expect(screen.getByRole("tab", { name: "Trades & sales" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Buys/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tabpanel", { name: "Trades & sales" })).toBeInTheDocument();
    expect(screen.queryByText("+ New order")).not.toBeInTheDocument();
  });

  it("moves between tabs with arrow keys, Home and End (roving tabindex)", async () => {
    render(<Harness />);
    const buys = screen.getByRole("tab", { name: "Buys" });
    buys.focus();
    expect(buys).toHaveAttribute("tabindex", "0");
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Trades & sales" })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Binder" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Buys" })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Binder" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Buys" })).toHaveAttribute("tabindex", "-1");
  });

  it("opens straight to the sub-tab App hands it", () => {
    render(<Harness initial="binder" />);
    expect(screen.getByRole("tab", { name: "Binder" })).toHaveAttribute("aria-selected", "true");
  });
});
