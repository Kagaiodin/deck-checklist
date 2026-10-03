import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { BuyListSheet } from "../BuyListSheet";
import type { Card } from "../../../types/index";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "card-1",
    name: "Lightning Bolt",
    quantity: 4,
    acquired: false,
    color: ["R"],
    type: "Instant",
    source: "need_to_buy",
    ...overrides,
  };
}

const baseProps = {
  isOpen: true,
  cards: [makeCard()],
  selectedVendorId: null,
  vendorPickerOpen: false,
  vendorLastUsed: {},
  sendState: "idle" as const,
  errorType: null,
  sendUrl: null,
  clipboardText: null,
  createdOrderId: null,
  onClose: vi.fn(),
  onOpenVendorPicker: vi.fn(),
  onCloseVendorPicker: vi.fn(),
  onConfirmVendor: vi.fn(),
  onSend: vi.fn(),
  onRetrySend: vi.fn(),
  onViewOrder: vi.fn(),
};

describe("BuyListSheet — Escape key", () => {
  it("calls onClose when Escape is pressed on the main view", () => {
    const onClose = vi.fn();
    render(<BuyListSheet {...baseProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose (not onCloseVendorPicker) when Escape is pressed in vendor picker", () => {
    const onClose = vi.fn();
    const onCloseVendorPicker = vi.fn();
    render(
      <BuyListSheet
        {...baseProps}
        vendorPickerOpen={true}
        onClose={onClose}
        onCloseVendorPicker={onCloseVendorPicker}
      />
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCloseVendorPicker).not.toHaveBeenCalled();
  });

  it("does not call onClose when sheet is closed", () => {
    const onClose = vi.fn();
    render(<BuyListSheet {...baseProps} isOpen={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not call onClose for other keys", () => {
    const onClose = vi.fn();
    render(<BuyListSheet {...baseProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Enter" });
    fireEvent.keyDown(document, { key: "Tab" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

const cards = [
  makeCard({ id: "a", name: "Lightning Bolt", quantity: 4 }),
  makeCard({ id: "b", name: "Sol Ring", quantity: 1 }),
];

describe("BuyListSheet — views", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("renders nothing when closed", () => {
    const { container } = render(<BuyListSheet {...baseProps} isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("empty state when there are no cards", () => {
    const onClose = vi.fn();
    render(<BuyListSheet {...baseProps} cards={[]} onClose={onClose} />);
    expect(screen.getByText("Buy list is empty")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("first use: lists cards, totals quantity and prompts for a vendor", () => {
    const onOpenVendorPicker = vi.fn();
    render(<BuyListSheet {...baseProps} cards={cards} onOpenVendorPicker={onOpenVendorPicker} />);
    expect(screen.getByText("5 cards")).toBeInTheDocument();
    expect(screen.getByText("Sol Ring")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Choose vendor to send →"));
    expect(onOpenVendorPicker).toHaveBeenCalled();
  });

  it("singular card count", () => {
    render(<BuyListSheet {...baseProps} cards={[makeCard({ quantity: 1 })]} />);
    expect(screen.getByText("1 card")).toBeInTheDocument();
  });

  it("with a vendor: shows last-used, Change and Send", () => {
    const onSend = vi.fn();
    const onOpenVendorPicker = vi.fn();
    render(
      <BuyListSheet
        {...baseProps} cards={cards} selectedVendorId="tcgplayer"
        vendorLastUsed={{ tcgplayer: Date.now() - 3 * 86400000 }}
        onSend={onSend} onOpenVendorPicker={onOpenVendorPicker}
      />,
    );
    expect(screen.getByText("Last used 3 days ago")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Send to TCGPlayer (5)"));
    expect(onSend).toHaveBeenCalledWith("tcgplayer");
    fireEvent.click(screen.getByText("Change"));
    expect(onOpenVendorPicker).toHaveBeenCalled();
  });

  it.each([
    [undefined, "Last used today"],
    [Date.now() - 86400000, "Last used yesterday"],
    [Date.now() - 65 * 86400000, "Last used 2 months ago"],
    [Date.now() - 35 * 86400000, "Last used 1 month ago"],
  ])("formats vendor last-used %#", (ts, label) => {
    render(
      <BuyListSheet
        {...baseProps} cards={cards} selectedVendorId="manapool"
        vendorLastUsed={ts ? { manapool: ts } : {}}
      />,
    );
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("disables actions and shows progress while sending", () => {
    const { rerender } = render(
      <BuyListSheet {...baseProps} cards={cards} selectedVendorId="manapool" sendState="sending" />,
    );
    expect(screen.getByText("Sending to Manapool…")).toBeInTheDocument();
    expect(screen.getByText("Change")).toBeDisabled();
    rerender(<BuyListSheet {...baseProps} cards={cards} selectedVendorId="tcgplayer" sendState="sending" />);
    expect(screen.getByText("Copying to clipboard…")).toBeInTheDocument();
  });

  it("backdrop closes but the sheet body does not", () => {
    const onClose = vi.fn();
    const { container } = render(<BuyListSheet {...baseProps} cards={cards} onClose={onClose} />);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector(".buy-sheet-backdrop")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("vendor picker view: backdrop goes back, Continue confirms", () => {
    const onCloseVendorPicker = vi.fn();
    const onConfirmVendor = vi.fn();
    const { container } = render(
      <BuyListSheet
        {...baseProps} cards={cards} vendorPickerOpen
        onCloseVendorPicker={onCloseVendorPicker} onConfirmVendor={onConfirmVendor}
      />,
    );
    fireEvent.click(screen.getByText("Continue"));
    expect(onConfirmVendor).toHaveBeenCalledWith("manapool");
    fireEvent.click(container.querySelector(".buy-sheet-backdrop")!);
    expect(onCloseVendorPicker).toHaveBeenCalled();
  });
});

describe("BuyListSheet — success view", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("prefill vendor: says a tab was opened", () => {
    render(<BuyListSheet {...baseProps} cards={cards} selectedVendorId="manapool" sendState="success" />);
    expect(screen.getByText("Sent to Manapool")).toBeInTheDocument();
    expect(screen.getByText("Tab opened with 5 cards pre-filled")).toBeInTheDocument();
    expect(screen.queryByLabelText("Copied card list preview")).not.toBeInTheDocument();
  });

  it("clipboard vendor with URL: shows preview and an Open link", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<BuyListSheet {...baseProps} cards={cards} selectedVendorId="tcgplayer" sendState="success" />);
    expect(screen.getByText("Copied to clipboard")).toBeInTheDocument();
    expect(screen.getByText("5 cards in TCGPlayer format")).toBeInTheDocument();
    expect(screen.getByLabelText("Copied card list preview")).toHaveTextContent("4 Lightning Bolt");
    fireEvent.click(screen.getByText("Open TCGPlayer →"));
    expect(open).toHaveBeenCalledWith("https://www.tcgplayer.com/massentry", "_blank");
  });

  it("clipboard vendor without URL: generic copy and no Open button", () => {
    render(<BuyListSheet {...baseProps} cards={[makeCard({ quantity: 1 })]} selectedVendorId="other" sendState="success" />);
    expect(screen.getByText("1 card — paste in any site")).toBeInTheDocument();
    expect(screen.queryByText(/^Open /)).not.toBeInTheDocument();
  });

  it("shows the order draft and View order navigates then closes", () => {
    const onViewOrder = vi.fn();
    const onClose = vi.fn();
    render(
      <BuyListSheet
        {...baseProps} cards={cards} selectedVendorId="manapool" sendState="success"
        createdOrderId="o1" onViewOrder={onViewOrder} onClose={onClose}
      />,
    );
    expect(screen.getByText("Order draft created")).toBeInTheDocument();
    fireEvent.click(screen.getByText("View order"));
    expect(onViewOrder).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("Done and × close", () => {
    const onClose = vi.fn();
    render(<BuyListSheet {...baseProps} cards={cards} selectedVendorId="manapool" sendState="success" onClose={onClose} />);
    fireEvent.click(screen.getByText("Done"));
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("BuyListSheet — error views", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("popup-blocked: offers to open the URL manually", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(
      <BuyListSheet
        {...baseProps} cards={cards} selectedVendorId="manapool" sendState="error"
        errorType="popup-blocked" sendUrl="https://manapool.com/add-deck?deck=abc"
      />,
    );
    expect(screen.getByText("Manapool tab was blocked")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Open Manapool →"));
    expect(open).toHaveBeenCalledWith("https://manapool.com/add-deck?deck=abc", "_blank");
  });

  it("popup-blocked without a URL hides the open button", () => {
    render(
      <BuyListSheet {...baseProps} cards={cards} selectedVendorId="manapool" sendState="error" errorType="popup-blocked" />,
    );
    expect(screen.queryByText("Open Manapool →")).not.toBeInTheDocument();
  });

  it("clipboard-denied: focuses the manual textarea and can retry", () => {
    const onRetrySend = vi.fn();
    render(
      <BuyListSheet
        {...baseProps} cards={cards} selectedVendorId="tcgplayer" sendState="error"
        errorType="clipboard-denied" clipboardText={"4 Lightning Bolt\n1 Sol Ring"}
        onRetrySend={onRetrySend}
      />,
    );
    const ta = screen.getByLabelText("Card list to copy manually") as HTMLTextAreaElement;
    expect(ta.value).toContain("4 Lightning Bolt");
    expect(ta).toHaveFocus();
    fireEvent.click(screen.getByText("Retry clipboard copy"));
    expect(onRetrySend).toHaveBeenCalledWith("tcgplayer");
  });

  it("clipboard-denied with no clipboard text renders an empty textarea", () => {
    render(
      <BuyListSheet {...baseProps} cards={cards} selectedVendorId="tcgplayer" sendState="error" errorType="clipboard-denied" />,
    );
    expect((screen.getByLabelText("Card list to copy manually") as HTMLTextAreaElement).value).toBe("");
  });

  it("an unrecognised error falls back to the main view", () => {
    render(
      <BuyListSheet {...baseProps} cards={cards} selectedVendorId="manapool" sendState="error" errorType={null} />,
    );
    expect(screen.getByText("Send to Manapool (5)")).toBeInTheDocument();
  });
});
