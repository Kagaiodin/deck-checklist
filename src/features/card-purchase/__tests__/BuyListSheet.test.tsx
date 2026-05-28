import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
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
