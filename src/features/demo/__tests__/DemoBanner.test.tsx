import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DemoBanner } from "../DemoBanner";
import { DemoConfirmModal } from "../DemoConfirmModal";
import { MemoryStorage } from "./memoryStorage";

let storage: MemoryStorage;
beforeEach(() => { storage = new MemoryStorage(); });

describe("DemoBanner", () => {
  it("renders nothing when demo mode is not active", () => {
    const { container } = render(<DemoBanner storage={storage} onExit={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the banner while active and Exit calls onExit", async () => {
    storage.setItem("fetchlist:demo:active", "true");
    const onExit = vi.fn();
    render(<DemoBanner storage={storage} onExit={onExit} />);

    expect(screen.getByRole("status")).toHaveTextContent(/demo mode/i);
    await userEvent.click(screen.getByRole("button", { name: /exit/i }));
    expect(onExit).toHaveBeenCalledOnce();
  });
});

describe("DemoConfirmModal", () => {
  it("explains the data is saved and wires Cancel and Load sample data", async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<DemoConfirmModal onCancel={onCancel} onConfirm={onConfirm} />);

    expect(screen.getByRole("dialog")).toHaveTextContent(/comes back when you exit/i);
    await userEvent.click(screen.getByRole("button", { name: "Load sample data" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("focuses Load sample data first and keeps Tab inside the dialog", async () => {
    render(<DemoConfirmModal onCancel={() => {}} onConfirm={() => {}} />);
    const confirm = screen.getByRole("button", { name: "Load sample data" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(confirm).toHaveFocus();
    await userEvent.tab();
    expect(cancel).toHaveFocus(); // wraps from the last control to the first
    await userEvent.tab({ shift: true });
    expect(confirm).toHaveFocus();
  });

  it("cancels on Escape", async () => {
    const onCancel = vi.fn();
    render(<DemoConfirmModal onCancel={onCancel} onConfirm={() => {}} />);
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
