import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SortPopover } from "../components/SortPopover";

describe("SortPopover", () => {
  it("renders all four sort options and marks the current one active", () => {
    render(<SortPopover collectionSort="qty-desc" onSortChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.getByText("Qty ↓")).toHaveClass("active");
    expect(screen.getByText("Name A→Z")).not.toHaveClass("active");
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
