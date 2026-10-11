import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewOrderSheet } from "../NewOrderSheet";
import type { Order, Deck } from "../../../types/index";

const orders: Order[] = [
  { id: "o1", createdAt: 1, orderDate: Date.parse("2026-05-01"), vendor: "ManaPool", status: "received", cards: [] },
  { id: "o2", createdAt: 2, orderDate: Date.parse("2026-05-20"), vendor: "ManaPool", status: "received", cards: [] },
  { id: "o3", createdAt: Date.parse("2026-04-01"), vendor: "Card Kingdom", status: "received", cards: [] },
];

const decks = [
  {
    id: "d1", name: "Atraxa", createdAt: 1,
    cards: [
      { id: "c1", name: "Sol Ring", quantity: 1, acquired: false, color: [], type: "Artifact" },
      { id: "c2", name: "Solemn Simulacrum", quantity: 1, acquired: false, color: [], type: "Artifact" },
    ],
  },
] as unknown as Deck[];

function setup(over: Partial<React.ComponentProps<typeof NewOrderSheet>> = {}) {
  const props: React.ComponentProps<typeof NewOrderSheet> = {
    orders,
    decks,
    recentVendors: ["Card Kingdom", "ManaPool", "Never Used"],
    onSubmit: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  render(<NewOrderSheet {...props} />);
  return props;
}

const user = () => userEvent.setup({ delay: null });
const next = () => screen.getByRole("button", { name: /Continue/ });

async function pickVendorAndContinue(u: ReturnType<typeof user>, vendor = "ManaPool") {
  await u.click(screen.getByText(vendor));
  await u.click(next());
}

async function addFreeformCard(u: ReturnType<typeof user>, name: string) {
  await u.type(screen.getByPlaceholderText("Search card name…"), `${name}{Enter}`);
}

describe("NewOrderSheet", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-06-10T12:00:00Z")); });
  afterEach(() => { vi.useRealTimers(); document.body.style.overflow = ""; });

  describe("step 1 — vendor", () => {
    it("lists vendors ordered by past-order count with history labels", () => {
      setup();
      const names = [...document.querySelectorAll(".nos-vname")].map(n => n.textContent);
      expect(names).toEqual(["ManaPool", "Card Kingdom", "Never Used"]);
      expect(screen.getByText("2 past")).toBeInTheDocument();
      expect(screen.getByText("No past orders")).toBeInTheDocument();
    });

    it("locks body scroll while open", () => {
      setup();
      expect(document.body.style.overflow).toBe("hidden");
    });

    it("disables Continue until a vendor is chosen", async () => {
      setup();
      expect(next()).toBeDisabled();
      await user().click(screen.getByText("ManaPool"));
      expect(next()).toBeEnabled();
      expect(screen.getByText("ManaPool").closest("button")).toHaveClass("selected");
    });

    it("preselects the default vendor", () => {
      setup({ defaultVendor: "Card Kingdom" });
      expect(next()).toBeEnabled();
    });

    it("supports a custom vendor name", async () => {
      const u = user();
      setup();
      await u.click(screen.getByText(/Other vendor/));
      expect(next()).toBeDisabled();
      await u.type(screen.getByPlaceholderText("Vendor name"), "  Local Shop ");
      expect(next()).toBeEnabled();
      await u.click(next());
      expect(screen.getByText("Local Shop")).toBeInTheDocument(); // header tag
    });

    it("Cancel, ✕ and the scrim close; the sheet body does not", async () => {
      const u = user();
      const p = setup();
      fireEvent.click(document.querySelector(".nos-sheet")!);
      expect(p.onClose).not.toHaveBeenCalled();
      await u.click(screen.getByRole("button", { name: "Cancel" }));
      await u.click(screen.getByRole("button", { name: "Close" }));
      fireEvent.click(document.querySelector(".nos-scrim")!);
      expect(p.onClose).toHaveBeenCalledTimes(3);
    });
  });

  describe("step 2 — cards", () => {
    it("starts in manual mode with an empty list; Continue is disabled", async () => {
      const u = user();
      setup();
      await pickVendorAndContinue(u);
      expect(screen.getByText(/No cards yet/)).toBeInTheDocument();
      expect(next()).toBeDisabled();
    });

    it("buy-list tab shows the empty state and can switch back", async () => {
      const u = user();
      setup();
      await pickVendorAndContinue(u);
      await u.click(screen.getByText(/From buy list/));
      expect(screen.getByText("Your buy list is empty.")).toBeInTheDocument();
      await u.click(screen.getByText("Add manually →"));
      expect(screen.getByPlaceholderText("Search card name…")).toBeInTheDocument();
    });

    it("searches decks and adds a deck card, then hides it from later results", async () => {
      const u = user();
      setup();
      await pickVendorAndContinue(u);
      await u.type(screen.getByPlaceholderText("Search card name…"), "sol");
      const results = screen.getByRole("list");
      expect(within(results).getByText("Sol Ring")).toBeInTheDocument();
      expect(within(results).getByText("Solemn Simulacrum")).toBeInTheDocument();
      await u.click(within(results).getByText("Sol Ring"));
      expect(screen.getByPlaceholderText("Search card name…")).toHaveValue("");

      await u.type(screen.getByPlaceholderText("Search card name…"), "sol");
      const again = screen.getByRole("list");
      // "Sol Ring" still appears in the order list, but not as a search result
      expect(within(again).queryByText("Sol Ring")).not.toBeInTheDocument();
    });

    it("needs at least 2 characters before searching", async () => {
      const u = user();
      setup();
      await pickVendorAndContinue(u);
      await u.type(screen.getByPlaceholderText("Search card name…"), "s");
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
    });

    it("Enter adds a freeform card when nothing matches, and merges duplicates", async () => {
      const u = user();
      setup();
      await pickVendorAndContinue(u);
      await addFreeformCard(u, "Black Lotus");
      await addFreeformCard(u, "black lotus");
      expect(screen.getAllByText("Black Lotus")).toHaveLength(1);
      expect(screen.getByDisplayValue("2")).toBeInTheDocument();
      expect(screen.getByText("1 line · 2 cards")).toBeInTheDocument();
    });

    it("the 'Add \"…\"' result adds a freeform card even when deck matches exist", async () => {
      const u = user();
      setup();
      await pickVendorAndContinue(u);
      await u.type(screen.getByPlaceholderText("Search card name…"), "sol");
      await u.click(screen.getByText(/^Add "/));
      expect(screen.getByText("1 line · 1 card")).toBeInTheDocument();
    });

    it("Enter does not add a freeform card when deck results exist", async () => {
      const u = user();
      setup();
      await pickVendorAndContinue(u);
      await u.type(screen.getByPlaceholderText("Search card name…"), "sol{Enter}");
      expect(screen.queryByText(/line/)).not.toBeInTheDocument();
    });

    it("edits quantity (clamped 1–99) and price, shows the total, and removes lines", async () => {
      const u = user();
      setup();
      await pickVendorAndContinue(u);
      await addFreeformCard(u, "Black Lotus");

      const qty = screen.getByDisplayValue("1");
      fireEvent.change(qty, { target: { value: "500" } });
      expect(screen.getByDisplayValue("99")).toBeInTheDocument();
      fireEvent.change(screen.getByDisplayValue("99"), { target: { value: "" } });
      expect(screen.getByDisplayValue("1")).toBeInTheDocument();
      fireEvent.change(screen.getByDisplayValue("1"), { target: { value: "3" } });

      fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "1.50" } });
      expect(screen.getByText("1 line · 3 cards · $4.50")).toBeInTheDocument();
      fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "" } });
      expect(screen.getByText("1 line · 3 cards")).toBeInTheDocument();

      await u.click(screen.getByRole("button", { name: "×" }));
      expect(screen.getByText(/No cards yet/)).toBeInTheDocument();
    });

    it("Back returns to the vendor step", async () => {
      const u = user();
      setup();
      await pickVendorAndContinue(u);
      await u.click(screen.getByRole("button", { name: /Back/ }));
      expect(screen.getByText("Where did you order from?")).toBeInTheDocument();
    });
  });

  describe("step 3 — details and creation", () => {
    async function toDetails(u: ReturnType<typeof user>) {
      await pickVendorAndContinue(u);
      await addFreeformCard(u, "Black Lotus");
      await u.click(next());
    }

    it("defaults ordered=today and expected=+5 days; carrier hidden until tracking", async () => {
      const u = user();
      setup();
      await toDetails(u);
      expect(screen.getByText("Order details")).toBeInTheDocument();
      const dates = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
      expect(dates[0].value).toBe("2026-06-10");
      expect(dates[1].value).toBe("2026-06-15");
      expect(screen.queryByText("Carrier")).not.toBeInTheDocument();
    });

    it("auto-detects the carrier from tracking and allows a manual override", async () => {
      const u = user();
      setup();
      await toDetails(u);
      await u.type(screen.getByPlaceholderText("Optional"), "1Z999AA10123456784");
      const select = screen.getByRole("combobox");
      expect(select).toHaveValue("ups");
      await u.selectOptions(select, "fedex");
      expect(select).toHaveValue("fedex");
      // manual choice sticks even as tracking changes
      await u.type(screen.getByPlaceholderText("Optional"), "X");
      expect(select).toHaveValue("fedex");
      // clearing tracking resets carrier
      await u.clear(screen.getByPlaceholderText("Optional"));
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });

    it("creates an order with all fields and shows the success step", async () => {
      const u = user();
      const p = setup();
      await toDetails(u);
      await u.type(screen.getByPlaceholderText("e.g. CK-29841"), "CK-1");
      await u.type(screen.getByPlaceholderText("Optional"), "1Z999AA10123456784");
      await u.click(screen.getByRole("button", { name: /Create order/ }));

      expect(p.onSubmit).toHaveBeenCalledTimes(1);
      const [order, vendor] = (p.onSubmit as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(vendor).toBe("ManaPool");
      expect(order).toMatchObject({
        vendor: "ManaPool",
        status: "active",
        notes: "Order #CK-1",
        trackingNumber: "1Z999AA10123456784",
        carrier: "ups",
        cards: [{ cardName: "Black Lotus", quantity: 1 }],
      });
      expect(order.id).toBeTruthy();

      expect(screen.getByText("Order created")).toBeInTheDocument();
      expect(screen.getByText("CK-1 created")).toBeInTheDocument();
      expect(screen.getByText(/arriving Jun 1[45]/)).toBeInTheDocument();
      expect(screen.getByText(/UPS ···6784/)).toBeInTheDocument();
      await u.click(screen.getByRole("button", { name: "Done" }));
      expect(p.onClose).toHaveBeenCalled();
    });

    it("creates with no optional details", async () => {
      const u = user();
      const p = setup();
      await toDetails(u);
      await u.click(screen.getByRole("button", { name: /Create order/ }));
      const [order] = (p.onSubmit as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(order.trackingNumber).toBeUndefined();
      expect(order.carrier).toBeUndefined();
      expect(order.notes).toBeUndefined();
      expect(screen.getByText("Order created", { selector: "h3" })).toBeInTheDocument();
    });

    it("uses the custom vendor when creating, and shows totals", async () => {
      const u = user();
      const p = setup();
      await u.click(screen.getByText(/Other vendor/));
      await u.type(screen.getByPlaceholderText("Vendor name"), "Local Shop");
      await u.click(next());
      await addFreeformCard(u, "Black Lotus");
      fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "2" } });
      await u.click(next());
      await u.click(screen.getByRole("button", { name: /Create order/ }));
      expect((p.onSubmit as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe("Local Shop");
      expect(screen.getAllByText(/\$2\.00/).length).toBeGreaterThan(0);
    });

    it("Back returns to cards", async () => {
      const u = user();
      setup();
      await toDetails(u);
      await u.click(screen.getByRole("button", { name: /Back/ }));
      expect(screen.getByText("What's in this order?")).toBeInTheDocument();
    });
  });

  describe("edit mode", () => {
    const editOrder: Order = {
      id: "e1",
      createdAt: 1,
      vendor: "ManaPool",
      status: "active",
      cards: [{ cardName: "Sol Ring", quantity: 2, price: 1 }],
      orderDate: Date.parse("2026-05-01"),
      expectedArrival: Date.parse("2026-05-08"),
      trackingNumber: "1Z999AA10123456784",
      carrier: "ups",
      notes: "Order #CK-7",
    };

    async function toDetails(u: ReturnType<typeof user>) {
      await u.click(next()); // vendor prefilled
      await u.click(next()); // cards prefilled
    }

    it("prefills every field", async () => {
      const u = user();
      setup({ editOrder, onSave: vi.fn() });
      expect(screen.getByText("Edit order")).toBeInTheDocument();
      await toDetails(u);
      expect(screen.getByDisplayValue("CK-7")).toBeInTheDocument();
      expect(screen.getByDisplayValue("1Z999AA10123456784")).toBeInTheDocument();
      expect(screen.getByRole("combobox")).toHaveValue("ups");
    });

    it("saves changes through onSave and shows the updated step", async () => {
      const u = user();
      const onSave = vi.fn();
      setup({ editOrder, onSave });
      await toDetails(u);
      await u.clear(screen.getByDisplayValue("CK-7"));
      await u.type(screen.getByPlaceholderText("e.g. CK-29841"), "CK-8");
      await u.click(screen.getByRole("button", { name: /Save changes/ }));
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        id: "e1", notes: "Order #CK-8", vendor: "ManaPool",
      }));
      expect(screen.getByText("Order updated")).toBeInTheDocument();
      expect(screen.getByText("ManaPool updated")).toBeInTheDocument();
    });

    it("delete requires confirmation; Keep cancels, Yes deletes and closes", async () => {
      const u = user();
      const onDeleteEdit = vi.fn();
      const onClose = vi.fn();
      setup({ editOrder, onDeleteEdit, onClose, onSave: vi.fn() });
      await toDetails(u);
      await u.click(screen.getByRole("button", { name: "Delete" }));
      expect(screen.getByText("Delete this order?")).toBeInTheDocument();
      await u.click(screen.getByRole("button", { name: "Keep" }));
      expect(screen.queryByText("Delete this order?")).not.toBeInTheDocument();
      await u.click(screen.getByRole("button", { name: "Delete" }));
      await u.click(screen.getByRole("button", { name: "Yes, delete" }));
      expect(onDeleteEdit).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it("does not create via onSubmit", async () => {
      const u = user();
      const p = setup({ editOrder, onSave: vi.fn() });
      await toDetails(u);
      await u.click(screen.getByRole("button", { name: /Save changes/ }));
      expect(p.onSubmit).not.toHaveBeenCalled();
    });
  });
});
