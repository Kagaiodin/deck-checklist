import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BulkEditPanel } from "../components/BulkEditPanel";
import type { Collection } from "../../../types/index";

const collection: Collection = {
  "lightning bolt": [{ quantity: 2 }],
  "sol ring": [{ quantity: 1 }],
  "counterspell": [{ quantity: 1 }],
};

function baseProps(over: Partial<React.ComponentProps<typeof BulkEditPanel>> = {}) {
  return {
    collection,
    collectionMeta: { fileName: "c.csv", importedAt: 1, cardCount: 1234 },
    bulkEditMode: "merge" as const,
    onModeChange: vi.fn(),
    bulkEditText: "",
    onTextChange: vi.fn(),
    bulkPreview: null,
    bulkEditError: null,
    clearConfirming: false,
    onClearConfirmChange: vi.fn(),
    onApply: vi.fn(),
    onClear: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
}

describe("BulkEditPanel", () => {
  it("disables Apply until there is text, then applies", async () => {
    const { rerender } = render(<BulkEditPanel {...baseProps()} />);
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();

    const onApply = vi.fn();
    rerender(<BulkEditPanel {...baseProps({ bulkEditText: "1 Sol Ring", onApply })} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalled();
  });

  it("forwards typing and mode changes", async () => {
    const onTextChange = vi.fn();
    const onModeChange = vi.fn();
    const user = userEvent.setup();
    render(<BulkEditPanel {...baseProps({ onTextChange, onModeChange })} />);
    await user.type(screen.getByRole("textbox"), "x");
    expect(onTextChange).toHaveBeenCalledWith("x");
    await user.click(screen.getByText("Replace all"));
    expect(onModeChange).toHaveBeenCalledWith("replace");
    await user.click(screen.getByText("Add to collection"));
    expect(onModeChange).toHaveBeenCalledWith("merge");
  });

  it("closes via header Close and Cancel", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<BulkEditPanel {...baseProps({ onClose })} />);
    await user.click(screen.getByRole("button", { name: "Close bulk edit" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows a dash with no preview and counts when there is one", () => {
    const { rerender } = render(<BulkEditPanel {...baseProps()} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    rerender(<BulkEditPanel {...baseProps({ bulkPreview: { added: 2, updated: 3, removed: 4 } })} />);
    expect(screen.getByText("+2 new")).toBeInTheDocument();
    expect(screen.getByText("3 set")).toBeInTheDocument();
    expect(screen.getByText("4 removed")).toBeInTheDocument();
  });

  it("renders an error message", () => {
    render(<BulkEditPanel {...baseProps({ bulkEditError: "No valid card lines" })} />);
    expect(screen.getByText("No valid card lines")).toBeInTheDocument();
  });

  it("clear flow: asks for confirmation, then clears and closes", async () => {
    const onClearConfirmChange = vi.fn();
    const onClear = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<BulkEditPanel {...baseProps({ onClearConfirmChange })} />);
    await user.click(screen.getByRole("button", { name: "Clear entire collection" }));
    expect(onClearConfirmChange).toHaveBeenCalledWith(true);

    rerender(<BulkEditPanel {...baseProps({ clearConfirming: true, onClearConfirmChange, onClear, onClose })} />);
    expect(screen.getByText("Remove all 1,234 cards?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yes, clear" }));
    expect(onClear).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("can back out of the clear confirmation", async () => {
    const onClearConfirmChange = vi.fn();
    render(<BulkEditPanel {...baseProps({ clearConfirming: true, onClearConfirmChange })} />);
    // two Cancel buttons: Apply/Cancel row and the confirm row
    await userEvent.setup().click(screen.getAllByRole("button", { name: "Cancel" })[1]);
    expect(onClearConfirmChange).toHaveBeenCalledWith(false);
  });

  it("warns in replace mode about how many cards will be removed", () => {
    render(<BulkEditPanel {...baseProps({
      bulkEditMode: "replace",
      bulkPreview: { added: 0, updated: 1, removed: 2 },
    })} />);
    expect(screen.getByText("This will remove 2 cards")).toBeInTheDocument();
  });

  it("shows no replace warning in merge mode", () => {
    render(<BulkEditPanel {...baseProps()} />);
    expect(screen.queryByText(/This will remove/)).not.toBeInTheDocument();
  });
});
