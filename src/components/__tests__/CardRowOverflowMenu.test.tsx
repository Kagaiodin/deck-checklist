import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardRowOverflowMenu } from "../CardRowOverflowMenu";

function setup(currentStatus: "owned" | "need_to_buy" | undefined = "need_to_buy") {
  const props = {
    cardId: "c1",
    cardName: "Sol Ring",
    currentStatus,
    onSetSource: vi.fn(),
    onRemoveCard: vi.fn(),
  };
  const parentClick = vi.fn();
  render(<div onClick={parentClick}><CardRowOverflowMenu {...props} /></div>);
  const trigger = screen.getByRole("button", { name: "Card actions for Sol Ring" });
  return { ...props, parentClick, trigger };
}

describe("CardRowOverflowMenu", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("is closed until the trigger is clicked, without bubbling to the row", async () => {
    const { trigger, parentClick } = setup();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.setup().click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("focuses the first status pill and toggles closed on a second click", async () => {
    const { trigger } = setup();
    const user = userEvent.setup();
    await user.click(trigger);
    expect(screen.getByRole("menuitemradio", { name: "Owned" })).toHaveFocus();
    await user.click(trigger);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("marks the current status and changes it", async () => {
    const { trigger, onSetSource } = setup();
    await userEvent.setup().click(trigger);
    expect(screen.getByRole("menuitemradio", { name: "Need" })).toHaveAttribute("aria-checked", "true");
    await userEvent.setup().click(screen.getByRole("menuitemradio", { name: "Proxy" }));
    expect(onSetSource).toHaveBeenCalledWith("c1", "proxy");
  });

  it("positions below the trigger normally and above it when near the bottom", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    trigger.getBoundingClientRect = () =>
      ({ top: 100, bottom: 120, right: 500 }) as DOMRect;
    Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true });
    Object.defineProperty(window, "innerWidth", { value: 800, configurable: true });
    await user.click(trigger);
    expect(screen.getByRole("menu").style.top).toBe("126px");

    await user.click(trigger); // close
    trigger.getBoundingClientRect = () =>
      ({ top: 900, bottom: 920, right: 500 }) as DOMRect;
    await user.click(trigger);
    const style = screen.getByRole("menu").style;
    expect(style.bottom).toBe("106px");
    expect(style.top).toBe("");
  });

  it("opens Scryfall printings in a new tab and closes", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const { trigger } = setup();
    const user = userEvent.setup();
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: /View all printings/ }));
    expect(open).toHaveBeenCalledWith(
      expect.stringContaining("unique=prints"), "_blank", "noopener,noreferrer",
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("remove flow: confirm, cancel, confirm again, remove", async () => {
    const { trigger, onRemoveCard } = setup();
    const user = userEvent.setup();
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: /Remove from deck/ }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: /Remove from deck/ }));
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemoveCard).toHaveBeenCalledWith("c1");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("Escape: backs out of confirm first, then closes and refocuses the trigger", async () => {
    const { trigger } = setup();
    const user = userEvent.setup();
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: /Remove from deck/ }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes on outside mousedown but not on inside mousedown", async () => {
    const { trigger } = setup();
    await userEvent.setup().click(trigger);
    fireEvent.mouseDown(screen.getByRole("menu"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
