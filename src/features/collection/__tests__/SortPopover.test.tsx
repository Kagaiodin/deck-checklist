import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SortPopover } from "../components/SortPopover";

describe("SortPopover", () => {
  it("renders all five sort options and marks the current one active", () => {
    render(<SortPopover collectionSort="qty-desc" onSortChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(5);
    expect(screen.getByText("Qty ↓")).toHaveClass("active");
    expect(screen.getByText("Name A→Z")).not.toHaveClass("active");
  });

  it("offers Group by set, separated by a divider", async () => {
    const onSortChange = vi.fn();
    render(<SortPopover collectionSort="name-asc" onSortChange={onSortChange} onClose={vi.fn()} />);
    expect(screen.getByText("Group by set")).toHaveClass("sort-option--divider");
    await userEvent.setup().click(screen.getByText("Group by set"));
    expect(onSortChange).toHaveBeenCalledWith("set");
  });

  it("calls onSortChange then onClose when an option is picked", async () => {
    const onSortChange = vi.fn();
    const onClose = vi.fn();
    render(<SortPopover collectionSort="name-asc" onSortChange={onSortChange} onClose={onClose} />);
    await userEvent.setup().click(screen.getByText("Qty ↑"));
    expect(onSortChange).toHaveBeenCalledWith("qty-asc");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
