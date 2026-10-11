import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, configure } from "@testing-library/react";
import { CardRowSheet } from "../CardRowSheet";
import type { Card } from "../../types/index";

const card: Card = {
  id: "c1", name: "Sol Ring", quantity: 1, acquired: false, color: [], type: "Artifact",
  set: "LTC", rarity: "uncommon", source: "need_to_buy", inputName: "Sol Ring (alt)",
};

function setup(over: Partial<Card> = {}) {
  const props = {
    card: { ...card, ...over },
    deckId: "d1",
    onClose: vi.fn(),
    onSetSource: vi.fn(),
    onRemoveCard: vi.fn(),
  };
  render(<CardRowSheet {...props} />);
  act(() => { vi.advanceTimersByTime(50); }); // animate-in frame
  return props;
}

describe("CardRowSheet", () => {
  // The sheet sits inside an aria-hidden scrim, so role queries must include hidden nodes.
  beforeEach(() => { vi.useFakeTimers(); configure({ defaultHidden: true }); });
  afterEach(() => { vi.useRealTimers(); configure({ defaultHidden: false }); document.body.style.overflow = ""; });

  it("shows card name, set chip, alt name and animates open", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Sol Ring" })).toHaveClass("sheet-open");
    expect(screen.getByText("LTC · U")).toBeInTheDocument();
    expect(screen.getByText("Sol Ring (alt)")).toBeInTheDocument();
  });

  it.each([
    ["mythic", "M"], ["rare", "R"], ["uncommon", "U"],
    ["special", "S"], ["bonus", "S"], ["common", "C"],
  ] as const)("labels %s rarity as %s", (rarity, label) => {
    setup({ rarity });
    expect(screen.getByText(`LTC · ${label}`)).toBeInTheDocument();
  });

  it("omits the set chip without set/rarity", () => {
    setup({ set: undefined, rarity: undefined, inputName: undefined });
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it("locks body scroll and restores it on unmount", () => {
    document.body.style.overflow = "auto";
    const { unmount } = render(
      <CardRowSheet card={card} deckId="d" onClose={vi.fn()} onSetSource={vi.fn()} onRemoveCard={vi.fn()} />,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("marks the current status and calls onSetSource on change", () => {
    const p = setup();
    expect(screen.getByRole("radio", { name: "Need" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Owned" }));
    expect(p.onSetSource).toHaveBeenCalledWith("c1", "owned");
  });

  it("focuses the first status pill once visible", () => {
    setup();
    expect(screen.getByRole("radio", { name: "Owned" })).toHaveFocus();
  });

  it("closes after the exit animation on scrim click, not on sheet click", () => {
    const p = setup();
    fireEvent.click(screen.getByRole("dialog"));
    act(() => { vi.advanceTimersByTime(300); });
    expect(p.onClose).not.toHaveBeenCalled();

    fireEvent.click(document.querySelector(".card-row-sheet-scrim")!);
    expect(p.onClose).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(250); });
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape closes the sheet", () => {
    const p = setup();
    fireEvent.keyDown(document, { key: "Escape" });
    act(() => { vi.advanceTimersByTime(250); });
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it("opens Scryfall printings in a new tab and closes", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const p = setup();
    fireEvent.click(screen.getByText("View all printings"));
    expect(open).toHaveBeenCalledWith(
      expect.stringContaining("scryfall.com/search?q=!\"Sol%20Ring\"&unique=prints"),
      "_blank",
      "noopener,noreferrer",
    );
    act(() => { vi.advanceTimersByTime(250); });
    expect(p.onClose).toHaveBeenCalled();
    open.mockRestore();
  });

  it("remove flow: confirm, cancel, then remove", () => {
    const p = setup();
    fireEvent.click(screen.getByText("Remove from deck"));
    expect(screen.getByText("Remove Sol Ring?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Remove Sol Ring?")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Remove from deck"));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(p.onRemoveCard).toHaveBeenCalledWith("c1");
    act(() => { vi.advanceTimersByTime(250); });
    expect(p.onClose).toHaveBeenCalled();
  });

  it("Escape in the confirm step returns to options instead of closing", () => {
    const p = setup();
    fireEvent.click(screen.getByText("Remove from deck"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Remove Sol Ring?")).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(250); });
    expect(p.onClose).not.toHaveBeenCalled();
  });

  it("swipe down past 30% closes; a short swipe snaps back", () => {
    const p = setup();
    const sheet = screen.getByRole("dialog");
    Object.defineProperty(sheet, "offsetHeight", { value: 400, configurable: true });

    fireEvent.touchStart(sheet, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(sheet, { touches: [{ clientY: 150 }] });
    expect(sheet.style.transform).toBe("translateY(50px)");
    fireEvent.touchEnd(sheet);
    expect(sheet.style.transform).toBe("");
    act(() => { vi.advanceTimersByTime(250); });
    expect(p.onClose).not.toHaveBeenCalled();

    fireEvent.touchStart(sheet, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(sheet, { touches: [{ clientY: 300 }] });
    fireEvent.touchEnd(sheet);
    act(() => { vi.advanceTimersByTime(250); });
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
});
