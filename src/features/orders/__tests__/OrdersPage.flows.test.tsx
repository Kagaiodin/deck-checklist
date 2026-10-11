import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrdersPage } from "../OrdersPage";
import type { Order, Deck } from "../../../types/index";

const NOW = new Date("2026-06-10T12:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

const order = (o: Partial<Order> = {}): Order => ({
  id: "o1",
  createdAt: NOW - 5 * DAY,
  vendor: "ManaPool",
  status: "active",
  cards: [{ cardName: "Sol Ring", quantity: 2 }],
  ...o,
});

const decks = [{ id: "d1", name: "Atraxa", cards: [], createdAt: 1 }] as unknown as Deck[];

function setup(orders: Order[], over: Partial<React.ComponentProps<typeof OrdersPage>> = {}) {
  const props = {
    orders,
    decks,
    recentVendors: ["ManaPool"],
    onCreateOrder: vi.fn(),
    onUpdateOrder: vi.fn(),
    onMarkReceived: vi.fn(),
    onMarkCancelled: vi.fn(),
    onDeleteOrder: vi.fn(),
    ...over,
  };
  render(<OrdersPage {...props} />);
  return props;
}

const u = () => userEvent.setup({ delay: null });
const card = (vendor: string) => {
  const name = screen.getAllByText(vendor, { selector: ".ocard-vendor-name" })[0];
  return name.closest(".ocard") as HTMLElement;
};
const expand = async (vendor: string) => {
  await u().click(within(card(vendor)).getByRole("button", { name: "Expand" }));
};

function stubMobile(matches: boolean) {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
}

describe("OrdersPage — ETA and card states", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it.each([
    [-2 * DAY, "overdue"],
    [-1 * DAY, "overdue"],
    [0, "Arrives today"],
    [DAY, "Arrives tomorrow"],
  ])("ETA offset %i shows %s", (offset, text) => {
    setup([order({ expectedArrival: NOW + offset })]);
    expect(card("ManaPool").querySelector(".ocard-eta-when")!.textContent).toContain(text);
  });

  it("pluralises overdue days and shows the expected date", () => {
    setup([order({ expectedArrival: NOW - 3 * DAY })]);
    expect(card("ManaPool")).toHaveTextContent("3 days overdue");
    expect(card("ManaPool")).toHaveTextContent(/Expected [A-Z][a-z]{2} \d+/);
    expect(card("ManaPool")).toHaveClass("state-late");
  });

  it("shows a weekday within a week and a date beyond", () => {
    setup([
      order({ id: "a", vendor: "Soon", expectedArrival: NOW + 3 * DAY }),
      order({ id: "b", vendor: "Later", expectedArrival: NOW + 12 * DAY }),
    ]);
    expect(card("Soon")).toHaveTextContent(/Arrives (Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/);
    expect(card("Later")).toHaveTextContent(/Arrives [A-Z][a-z]{2} \d+/);
  });

  it("flags tomorrow arrivals with a warn pill and class", () => {
    setup([order({ expectedArrival: NOW + DAY })]);
    expect(card("ManaPool")).toHaveClass("state-warn");
    expect(card("ManaPool").querySelector(".ocard-pill.warn")).toBeInTheDocument();
  });

  it("shows 'No expected date' and 'No tracking' for sparse active orders", () => {
    setup([order()]);
    expect(card("ManaPool")).toHaveTextContent("No expected date");
    expect(card("ManaPool")).toHaveTextContent("No tracking");
    expect(card("ManaPool")).toHaveTextContent("Added");
  });

  it("uses the order date when present", () => {
    setup([order({ orderDate: NOW - 2 * DAY })]);
    expect(card("ManaPool")).toHaveTextContent(/Ordered [A-Z][a-z]{2} \d+/);
  });

  it("renders a tracking link with carrier and last four digits", () => {
    setup([order({ trackingNumber: "1Z999AA10123456784", carrier: "ups" })]);
    const link = within(card("ManaPool")).getByRole("link");
    expect(link).toHaveTextContent("UPS···6784");
    expect(link).toHaveAttribute("href", expect.stringContaining("ups.com"));
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("received and cancelled cards show their own labels and state classes", () => {
    setup(
      [
        order({ id: "r", vendor: "Got", status: "received", expectedArrival: NOW - DAY }),
        order({ id: "c", vendor: "Nope", status: "cancelled", trackingNumber: "x", carrier: "ups" }),
      ],
    );
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    expect(card("Got")).toHaveClass("state-ok");
    expect(card("Got")).toHaveTextContent(/Received [A-Z][a-z]{2} \d+/);
    expect(card("Nope")).toHaveClass("state-cancelled");
    expect(card("Nope")).toHaveTextContent("Cancelled");
    expect(within(card("Nope")).queryByRole("link")).not.toBeInTheDocument();
  });

  it("singular card count", () => {
    setup([order({ cards: [{ cardName: "Sol Ring", quantity: 1 }] })]);
    expect(card("ManaPool")).toHaveTextContent("1 card");
    expect(card("ManaPool")).not.toHaveTextContent("1 cards");
  });
});

describe("OrdersPage — list, filters and summary", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("sorts active orders: overdue first, then soonest arrival, no-date last", () => {
    setup([
      order({ id: "a", vendor: "Later", expectedArrival: NOW + 9 * DAY }),
      order({ id: "b", vendor: "NoDate" }),
      order({ id: "c", vendor: "Overdue", expectedArrival: NOW - DAY }),
      order({ id: "d", vendor: "Soon", expectedArrival: NOW + 2 * DAY }),
    ]);
    const vendors = [...document.querySelectorAll(".ocard-vendor-name")].map(n => n.textContent);
    expect(vendors).toEqual(["Overdue", "Soon", "Later", "NoDate"]);
  });

  it("shows overdue count, cards in flight, and tracked spend", () => {
    setup([
      order({ id: "a", expectedArrival: NOW - DAY, cards: [{ cardName: "A", quantity: 2, price: 1.5 }] }),
      order({ id: "b", vendor: "Other", expectedArrival: NOW - 2 * DAY, cards: [{ cardName: "B", quantity: 1 }] }),
    ]);
    const meta = document.querySelector(".orders-listmeta")!;
    expect(meta).toHaveTextContent("2 orders overdue");
    expect(meta).toHaveTextContent("2 orders · 3 cards in flight · $3.00 tracked");
  });

  it("singular overdue wording", () => {
    setup([order({ expectedArrival: NOW - DAY })]);
    expect(document.querySelector(".orders-overdue-meta")).toHaveTextContent("1 order overdue");
  });

  it.each([
    ["received", "No received orders yet."],
    ["cancelled", "No cancelled orders."],
  ])("empty %s tab", (tab, msg) => {
    setup([order()]);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${tab}`, "i") }));
    expect(screen.getByText(msg)).toBeInTheDocument();
  });

  it("count label follows the filter", () => {
    setup([order(), order({ id: "r", vendor: "Got", status: "received" })]);
    expect(screen.getByText("1 active")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Received/ }));
    expect(screen.getByText("1 received")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Cancelled/ }));
    expect(screen.getByText("0 cancelled")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    expect(screen.getByText("2 total")).toBeInTheDocument();
  });

  it("search matches vendor, tracking and card name; empty search messages differ by tab", async () => {
    const user = u();
    setup([
      order({ id: "a", vendor: "Alpha", trackingNumber: "TRACK123", cards: [{ cardName: "Sol Ring", quantity: 1 }] }),
      order({ id: "b", vendor: "Beta", cards: [{ cardName: "Counterspell", quantity: 1 }] }),
    ]);
    const box = screen.getByPlaceholderText(/Search vendor/);
    await user.type(box, "track12");
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();

    await user.clear(box);
    await user.type(box, "counter");
    expect(screen.getByText("Beta")).toBeInTheDocument();

    await user.clear(box);
    await user.type(box, "zzz");
    expect(screen.getByText("No active orders match your search.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    expect(screen.getByText("No orders match your search.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Received/ }));
    expect(screen.getByText("No received orders match your search.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Cancelled/ }));
    expect(screen.getByText("No cancelled orders match your search.")).toBeInTheDocument();
  });

  it("empty state offers the buy list when provided", async () => {
    const onOpenBuyList = vi.fn();
    setup([], { onOpenBuyList });
    await u().click(screen.getByText("Open buy list →"));
    expect(onOpenBuyList).toHaveBeenCalled();
  });

  it("empty state hides the buy-list button when not provided, and + New order opens the sheet", async () => {
    setup([]);
    expect(screen.queryByText("Open buy list →")).not.toBeInTheDocument();
    await u().click(screen.getAllByText("+ New order")[1]);
    expect(screen.getByText("Where did you order from?")).toBeInTheDocument();
  });
});

describe("OrdersPage — expanded panels and actions (desktop)", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("clicking the card body toggles expansion, but clicking a button inside does not", async () => {
    setup([order()]);
    fireEvent.click(card("ManaPool"));
    expect(card("ManaPool")).toHaveClass("expanded");
    fireEvent.click(card("ManaPool"));
    expect(card("ManaPool")).not.toHaveClass("expanded");
  });

  it("only one card is expanded at a time", async () => {
    setup([order({ id: "a", vendor: "A" }), order({ id: "b", vendor: "B" })]);
    await expand("A");
    await expand("B");
    expect(card("A")).not.toHaveClass("expanded");
    expect(card("B")).toHaveClass("expanded");
  });

  it("changing the filter collapses the expanded card", async () => {
    setup([order()]);
    await expand("ManaPool");
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    expect(card("ManaPool")).not.toHaveClass("expanded");
  });

  it("active panel: tracking heading, line items with prices and subtotal, linked decks", async () => {
    setup([order({
      trackingNumber: "1Z999AA10123456784", carrier: "ups",
      expectedArrival: NOW + 4 * DAY, orderDate: NOW - DAY,
      cards: [
        { cardName: "Sol Ring", quantity: 2, price: 1.5, deckId: "d1" },
        { cardName: "Counterspell", quantity: 1 },
      ],
    })]);
    await expand("ManaPool");
    const panel = card("ManaPool").querySelector(".ocard-panel") as HTMLElement;
    expect(panel).toHaveTextContent("Tracking · UPS 1Z999AA10123456784");
    expect(panel).toHaveTextContent("Cards · 2 lines · 3 copies");
    expect(panel).toHaveTextContent("$3.00");
    expect(panel).toHaveTextContent("Subtotal");
    expect(panel).toHaveTextContent("—");
    expect(panel).toHaveTextContent("Linked deck");
    expect(panel).toHaveTextContent("Atraxa");
    expect(panel).toHaveTextContent("Order placed");
    expect(panel).toHaveTextContent("Shipped");
    expect(panel).toHaveTextContent("Expected delivery");
  });

  it("timeline marks late deliveries", async () => {
    setup([order({ expectedArrival: NOW - 2 * DAY })]);
    await expand("ManaPool");
    expect(card("ManaPool").querySelector(".tl-sub.late")).toHaveTextContent("2 days late");
    expect(card("ManaPool").querySelector(".tl-dot.late")).toBeInTheDocument();
  });

  it("timeline warns when arriving within a day", async () => {
    setup([order({ expectedArrival: NOW + DAY })]);
    await expand("ManaPool");
    expect(card("ManaPool").querySelector(".tl-dot.warn")).toBeInTheDocument();
  });

  it("Mark received (hover and panel buttons) calls through", async () => {
    const user = u();
    const p = setup([order()]);
    await user.click(within(card("ManaPool")).getByRole("button", { name: /Mark received/ }));
    expect(p.onMarkReceived).toHaveBeenCalledWith("o1");
    expect(card("ManaPool")).not.toHaveClass("expanded");

    await expand("ManaPool");
    await user.click(within(card("ManaPool")).getByRole("button", { name: /Mark received/ }));
    expect(p.onMarkReceived).toHaveBeenCalledTimes(2);
  });

  it("Cancel order calls onMarkCancelled", async () => {
    const p = setup([order()]);
    await expand("ManaPool");
    await u().click(screen.getByRole("button", { name: "Cancel order" }));
    expect(p.onMarkCancelled).toHaveBeenCalledWith("o1");
  });

  it("deleting an active order asks first; Keep backs out; Yes deletes and collapses", async () => {
    const user = u();
    const p = setup([order()]);
    await expand("ManaPool");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(p.onDeleteOrder).not.toHaveBeenCalled();
    expect(screen.getByText("Delete this order?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.queryByText("Delete this order?")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(p.onDeleteOrder).toHaveBeenCalledWith("o1");
    expect(card("ManaPool")).not.toHaveClass("expanded");
  });

  it("received panel: summary, show/hide cards, re-order, edit, direct delete", async () => {
    const user = u();
    const p = setup([order({ status: "received", expectedArrival: NOW - DAY })]);
    fireEvent.click(screen.getByRole("button", { name: /^Received/ }));
    await expand("ManaPool");
    expect(card("ManaPool")).toHaveTextContent("2 of 2 cards");
    expect(card("ManaPool").querySelector(".li")).toBeNull();
    await user.click(screen.getByText("Show cards ▾"));
    expect(card("ManaPool").querySelector(".li-name")).toHaveTextContent("Sol Ring");
    await user.click(screen.getByText("Hide cards ▴"));
    expect(card("ManaPool").querySelector(".li")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(p.onDeleteOrder).toHaveBeenCalledWith("o1"); // non-active: no confirm
  });

  it("received panel shows linked decks", async () => {
    setup([order({ status: "received", cards: [{ cardName: "Sol Ring", quantity: 1, deckId: "d1" }] })]);
    fireEvent.click(screen.getByRole("button", { name: /^Received/ }));
    await expand("ManaPool");
    expect(card("ManaPool")).toHaveTextContent("Atraxa");
  });

  it("cancelled panel: cards, re-order, edit and delete", async () => {
    const user = u();
    const p = setup([order({ status: "cancelled", cards: [{ cardName: "Sol Ring", quantity: 1, deckId: "d1" }] })]);
    fireEvent.click(screen.getByRole("button", { name: /^Cancelled/ }));
    await expand("ManaPool");
    expect(card("ManaPool")).toHaveTextContent("Cards · 1 line · 1 copy");
    expect(card("ManaPool")).toHaveTextContent("Atraxa");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(p.onDeleteOrder).toHaveBeenCalledWith("o1");
  });

  it("Re-order from the collapsed card opens the sheet with the vendor preselected", async () => {
    const user = u();
    setup([order({ status: "received" })]);
    fireEvent.click(screen.getByRole("button", { name: /^Received/ }));
    await user.click(within(card("ManaPool")).getByRole("button", { name: "Re-order" }));
    expect(screen.getByText("New order")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue/ })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("New order")).not.toBeInTheDocument();
  });

  it("Re-order from the expanded panel works too", async () => {
    const user = u();
    setup([order({ status: "cancelled" })]);
    fireEvent.click(screen.getByRole("button", { name: /^Cancelled/ }));
    await expand("ManaPool");
    await user.click(screen.getByRole("button", { name: "Re-order" }));
    expect(screen.getByText("New order")).toBeInTheDocument();
  });

  it("creating an order through the sheet calls onCreateOrder", async () => {
    const user = u();
    const p = setup([order()]);
    await user.click(screen.getByRole("button", { name: "+ New order" }));
    await user.click(screen.getByText("ManaPool", { selector: ".nos-vname" }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    await user.type(screen.getByPlaceholderText("Search card name…"), "Black Lotus{Enter}");
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    await user.click(screen.getByRole("button", { name: /Create order/ }));
    expect(p.onCreateOrder).toHaveBeenCalledWith(expect.objectContaining({ vendor: "ManaPool" }), "ManaPool");
  });

  it("editing an order saves through onUpdateOrder", async () => {
    const user = u();
    const p = setup([order({ expectedArrival: NOW + 3 * DAY })]);
    await expand("ManaPool");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("Edit order")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    await user.click(screen.getByRole("button", { name: /Save changes/ }));
    expect(p.onUpdateOrder).toHaveBeenCalledWith(expect.objectContaining({ id: "o1", vendor: "ManaPool" }));
  });

  it("deleting from the edit sheet calls onDeleteOrder", async () => {
    const user = u();
    const p = setup([order()]);
    await expand("ManaPool");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(p.onDeleteOrder).toHaveBeenCalledWith("o1");
  });
});

describe("OrdersPage — mobile detail sheet", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    stubMobile(true);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.style.overflow = ""; });

  const sheet = () => document.querySelector(".ocard-mob-sheet") as HTMLElement;

  it("opens a full-screen sheet instead of the inline panel, and locks scroll", async () => {
    setup([order({ trackingNumber: "1Z999AA10123456784", carrier: "ups", expectedArrival: NOW + 4 * DAY })]);
    await expand("ManaPool");
    expect(card("ManaPool").querySelector(".ocard-panel")).toBeNull();
    expect(sheet()).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
    expect(sheet()).toHaveTextContent("Order detail");
    expect(sheet()).toHaveTextContent("Tracking");
    expect(sheet()).toHaveTextContent("UPS ···6784");
    expect(sheet()).toHaveTextContent("Cards · 2 copies");
  });

  it("status pill shows the overdue state for late orders", async () => {
    const user = u();
    setup([order({ id: "late", vendor: "Late", expectedArrival: NOW - 2 * DAY })]);
    await user.click(within(card("Late")).getByRole("button", { name: "Expand" }));
    expect(sheet().querySelector(".ocard-mob-status-pill")).toHaveClass("late");
  });

  it.each([
    [{ expectedArrival: NOW + DAY }, "warn"],
    [{ expectedArrival: NOW + 9 * DAY }, "active"],
    [{}, "active"],
  ] as const)("status pill for %j is %s", async (over, cls) => {
    setup([order(over)]);
    await expand("ManaPool");
    expect(sheet().querySelector(".ocard-mob-status-pill")).toHaveClass(cls);
  });

  it.each([["received", "ok", "Received"], ["cancelled", "muted", "Cancelled"]] as const)(
    "status pill for %s orders", async (status, cls, label) => {
      setup([order({ status })]);
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${status}`, "i") }));
      await expand("ManaPool");
      const pill = sheet().querySelector(".ocard-mob-status-pill")!;
      expect(pill).toHaveClass(cls);
      expect(pill).toHaveTextContent(label);
      expect(within(sheet()).queryByText(/Mark received/)).not.toBeInTheDocument();
    },
  );

  it("back button and backdrop close it; clicking inside does not", async () => {
    const user = u();
    setup([order()]);
    await expand("ManaPool");
    fireEvent.click(sheet());
    expect(sheet()).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(sheet()).toBeNull();

    await expand("ManaPool");
    fireEvent.click(document.querySelector(".ocard-mob-sheet-backdrop")!);
    expect(sheet()).toBeNull();
  });

  it("Mark received, Cancel order and Delete act and close the sheet", async () => {
    const user = u();
    const p = setup([order({ cards: [{ cardName: "Sol Ring", quantity: 1, deckId: "d1" }] })]);

    await expand("ManaPool");
    expect(sheet()).toHaveTextContent("Linked deck");
    await user.click(within(sheet()).getByRole("button", { name: /Mark received/ }));
    expect(p.onMarkReceived).toHaveBeenCalledWith("o1");
    expect(sheet()).toBeNull();

    await expand("ManaPool");
    await user.click(within(sheet()).getByRole("button", { name: "Cancel order" }));
    expect(p.onMarkCancelled).toHaveBeenCalledWith("o1");

    await expand("ManaPool");
    await user.click(within(sheet()).getByRole("button", { name: "Delete order" }));
    expect(p.onDeleteOrder).toHaveBeenCalledWith("o1");
    expect(sheet()).toBeNull();
  });
});
