import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useRef } from "react";
import { useDialogKeys } from "../useDialogKeys";

function Harness({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogKeys(ref, onClose);
  return (
    <div ref={ref} role="dialog">
      <button>first</button>
      <button>last</button>
    </div>
  );
}

function Host({ onClose, open }: { onClose: () => void; open: boolean }) {
  return (
    <>
      <button>opener</button>
      {open && <Harness onClose={onClose} />}
    </>
  );
}

function Options({ active, onClose }: { active: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogKeys(ref, onClose, { active, initialFocus: () => ref.current?.querySelector<HTMLElement>("[data-pick]") });
  return (
    <div ref={ref}>
      <button>first</button>
      <button data-pick>picked</button>
    </div>
  );
}

describe("useDialogKeys — options", () => {
  it("focuses the element chosen by initialFocus instead of the first", () => {
    render(<Options active onClose={vi.fn()} />);
    expect(screen.getByText("picked")).toHaveFocus();
  });

  it("does nothing while inactive, and starts once activated", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Options active={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("picked")).not.toHaveFocus();
    rerender(<Options active onClose={onClose} />);
    expect(screen.getByText("picked")).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("useDialogKeys", () => {
  it("focuses the first control on mount", () => {
    render(<Harness onClose={vi.fn()} />);
    expect(screen.getByText("first")).toHaveFocus();
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("wraps Tab and Shift+Tab inside the dialog", () => {
    render(<Harness onClose={vi.fn()} />);
    screen.getByText("last").focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByText("first")).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByText("last")).toHaveFocus();
  });

  it("pulls focus back in if it escaped", () => {
    render(<Harness onClose={vi.fn()} />);
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByText("first")).toHaveFocus();
  });

  it("restores focus to the opener on unmount", () => {
    const { rerender } = render(<Host onClose={vi.fn()} open={false} />);
    screen.getByText("opener").focus();
    rerender(<Host onClose={vi.fn()} open />);
    expect(screen.getByText("first")).toHaveFocus();
    rerender(<Host onClose={vi.fn()} open={false} />);
    expect(screen.getByText("opener")).toHaveFocus();
  });

  it("stops listening after unmount", () => {
    const onClose = vi.fn();
    const { unmount } = render(<Harness onClose={onClose} />);
    unmount();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
