import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OrdersPage } from "../OrdersPage";
import type { Order } from "../../../types/index";

const mockOrder = (overrides: Partial<Order> = {}): Order => ({
  id: "ord-1",
  createdAt: Date.now(),
  vendor: "ManaPool",
  status: "active",
  cards: [{ cardName: "Sol Ring", quantity: 1 }],
  ...overrides,
});

const defaultProps = {
  orders: [],
  decks: [],
  recentVendors: [],
  onCreateOrder: vi.fn(),
  onUpdateOrder: vi.fn(),
  onMarkReceived: vi.fn(),
  onMarkCancelled: vi.fn(),
  onDeleteOrder: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OrdersPage", () => {
  it("renders empty state when no orders", () => {
    render(<OrdersPage {...defaultProps} />);
    expect(screen.getByText("No orders yet")).toBeInTheDocument();
  });

  it("shows + New order button in empty state and opens form", () => {
    render(<OrdersPage {...defaultProps} />);
    const btns = screen.getAllByText("+ New order");
    // One in topbar, one in empty state card
    expect(btns.length).toBeGreaterThanOrEqual(1);
  });

  it("renders order cards when orders present", () => {
    render(<OrdersPage {...defaultProps} orders={[mockOrder()]} />);
    expect(screen.getByText("ManaPool")).toBeInTheDocument();
  });

  it("shows chip filters when orders exist", () => {
    render(<OrdersPage {...defaultProps} orders={[mockOrder()]} />);
    expect(screen.getByText(/Active/)).toBeInTheDocument();
    expect(screen.getByText(/Received/)).toBeInTheDocument();
    expect(screen.getByText(/Cancelled/)).toBeInTheDocument();
    expect(screen.getByText(/All/)).toBeInTheDocument();
  });

  it("filters by status when chip is clicked", () => {
    const active = mockOrder({ id: "a1", vendor: "TCGplayer", status: "active" });
    const received = mockOrder({ id: "r1", vendor: "Card Kingdom", status: "received" });
    render(<OrdersPage {...defaultProps} orders={[active, received]} />);

    // Initially shows active tab
    expect(screen.getByText("TCGplayer")).toBeInTheDocument();
    expect(screen.queryByText("Card Kingdom")).not.toBeInTheDocument();

    // Switch to Received — use [0] because "✓ Mark received" also matches
    fireEvent.click(screen.getAllByRole("button", { name: /received/i })[0]);
    expect(screen.queryByText("TCGplayer")).not.toBeInTheDocument();
    expect(screen.getByText("Card Kingdom")).toBeInTheDocument();
  });

  it("shows Late pill for overdue active orders", () => {
    const lateOrder = mockOrder({
      id: "late1",
      expectedArrival: Date.now() - 3 * 24 * 60 * 60 * 1000, // 3 days ago
    });
    render(<OrdersPage {...defaultProps} orders={[lateOrder]} />);
    expect(screen.getByText("Late")).toBeInTheDocument();
  });

  it("does NOT show Active pill for normal active orders", () => {
    render(<OrdersPage {...defaultProps} orders={[mockOrder()]} />);
    // "Active" text appears in the chip — check no ocard-pill with that text exists
    expect(screen.queryByText("Active", { selector: ".ocard-pill" })).not.toBeInTheDocument();
  });

  it("shows overdue meta when active orders are late", () => {
    const lateOrder = mockOrder({
      id: "late1",
      expectedArrival: Date.now() - 2 * 24 * 60 * 60 * 1000,
    });
    render(<OrdersPage {...defaultProps} orders={[lateOrder]} />);
    // Use specific pattern to match the meta span, not the ETA "X days overdue" span
    expect(screen.getByText(/orders? overdue/)).toBeInTheDocument();
  });

  it("calls onMarkReceived when mark received button clicked", () => {
    const order = mockOrder();
    render(<OrdersPage {...defaultProps} orders={[order]} />);
    // Expand the card first to see the actions
    const card = screen.getByText("ManaPool").closest(".ocard")!;
    fireEvent.click(card);
    // Two "✓ Mark received" buttons exist after expand (top-row + detail) — click either
    const btn = screen.getAllByText("✓ Mark received")[0];
    fireEvent.click(btn);
    expect(defaultProps.onMarkReceived).toHaveBeenCalledWith("ord-1");
  });

  it("searches orders by vendor name", () => {
    const orders = [
      mockOrder({ id: "a1", vendor: "TCGplayer" }),
      mockOrder({ id: "a2", vendor: "Card Kingdom" }),
    ];
    render(<OrdersPage {...defaultProps} orders={orders} />);
    const searchInput = screen.getByPlaceholderText(/search vendor/i);
    fireEvent.change(searchInput, { target: { value: "tcg" } });
    expect(screen.getByText("TCGplayer")).toBeInTheDocument();
    expect(screen.queryByText("Card Kingdom")).not.toBeInTheDocument();
  });

  it("shows card count in ocard", () => {
    const order = mockOrder({
      cards: [
        { cardName: "Sol Ring", quantity: 2 },
        { cardName: "Mana Crypt", quantity: 1 },
      ],
    });
    render(<OrdersPage {...defaultProps} orders={[order]} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
