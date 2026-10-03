import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AlphaRail } from "../components/AlphaRail";

function setup(onJump = vi.fn()) {
  const { container } = render(
    <AlphaRail letterIndexMap={new Map([["A", 0], ["B", 3]])} activeLetter="B" onJump={onJump} />,
  );
  const rail = container.querySelector(".alpha-rail") as HTMLElement;
  // 260px tall rail starting at y=0 → 10px per letter
  rail.getBoundingClientRect = () => ({ top: 0, height: 260 }) as DOMRect;
  return { rail, onJump };
}

describe("AlphaRail", () => {
  it("renders 26 letters, flagging empty and active ones", () => {
    setup();
    expect(document.querySelectorAll(".alpha-rail-item")).toHaveLength(26);
    expect(screen.getByText("A")).not.toHaveClass("empty");
    expect(screen.getByText("C")).toHaveClass("empty");
    expect(screen.getByText("B")).toHaveClass("active");
  });

  it("jumps to the letter under the pointer on press", () => {
    const { rail, onJump } = setup();
    fireEvent.pointerDown(rail, { clientY: 25, buttons: 1 });
    expect(onJump).toHaveBeenCalledWith("C");
  });

  it("clamps to A and Z at the edges", () => {
    const { rail, onJump } = setup();
    fireEvent.pointerDown(rail, { clientY: -50, buttons: 1 });
    expect(onJump).toHaveBeenLastCalledWith("A");
    fireEvent.pointerDown(rail, { clientY: 999, buttons: 1 });
    expect(onJump).toHaveBeenLastCalledWith("Z");
  });

  it("ignores hover movement without a pressed button", () => {
    const { rail, onJump } = setup();
    fireEvent.pointerMove(rail, { clientY: 25, buttons: 0 });
    expect(onJump).not.toHaveBeenCalled();
  });

  it("scrubs while dragging", () => {
    const { rail, onJump } = setup();
    fireEvent.pointerMove(rail, { clientY: 5, buttons: 1 });
    expect(onJump).toHaveBeenCalledWith("A");
  });
});
