import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DemoMenuItem } from "../DemoMenuItem";

describe("DemoMenuItem", () => {
  it("explains what it does and calls onSelect when clicked", async () => {
    const onSelect = vi.fn();
    render(<DemoMenuItem onSelect={onSelect} />);

    const btn = screen.getByRole("button", { name: /load sample data/i });
    expect(btn).toHaveAccessibleDescription(/your own data is saved and returns when you exit/i);
    await userEvent.click(btn);
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
