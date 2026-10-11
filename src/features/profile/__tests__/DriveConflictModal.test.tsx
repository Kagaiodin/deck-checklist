import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DriveConflictModal } from "../DriveConflictModal";

function setup() {
  const props = {
    drive: { modifiedTime: "2026-03-04T15:30:00Z", deckCount: 5, cardCount: 400 },
    local: { deckCount: 2, cardCount: 120 },
    onKeepDrive: vi.fn(),
    onKeepLocal: vi.fn(),
  };
  const { container } = render(<DriveConflictModal {...props} />);
  return { ...props, container };
}

describe("DriveConflictModal", () => {
  it("shows counts for both versions and defaults to Drive, focusing the first radio", () => {
    setup();
    expect(screen.getByText("400 cards · 5 decks")).toBeInTheDocument();
    expect(screen.getByText("120 cards · 2 decks")).toBeInTheDocument();
    const [drive, local] = screen.getAllByRole("radio");
    expect(drive).toHaveAttribute("aria-checked", "true");
    expect(local).toHaveAttribute("aria-checked", "false");
    expect(drive).toHaveFocus();
    expect(screen.getByRole("button", { name: "Keep Drive version" })).toBeInTheDocument();
  });

  it("confirms the Drive version by default", async () => {
    const p = setup();
    await userEvent.setup().click(screen.getByRole("button", { name: "Keep Drive version" }));
    expect(p.onKeepDrive).toHaveBeenCalledTimes(1);
    expect(p.onKeepLocal).not.toHaveBeenCalled();
  });

  it("switching to this device changes the confirm action", async () => {
    const p = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /This device/ }));
    await user.click(screen.getByRole("button", { name: "Keep this device" }));
    expect(p.onKeepLocal).toHaveBeenCalledTimes(1);
    expect(p.onKeepDrive).not.toHaveBeenCalled();
  });

  it("Cancel, Escape and backdrop click all keep local data", async () => {
    const p = setup();
    await userEvent.setup().click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(p.container.querySelector(".drive-conflict-backdrop")!);
    expect(p.onKeepLocal).toHaveBeenCalledTimes(3);
  });

  it("clicking inside the dialog does not dismiss it", () => {
    const p = setup();
    fireEvent.click(screen.getByRole("dialog"));
    expect(p.onKeepLocal).not.toHaveBeenCalled();
  });

  it("traps Tab focus within the dialog", () => {
    setup();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Keep Drive version" });
    const first = screen.getAllByRole("radio")[0];

    confirm.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();
    void cancel;
  });

  it("restores focus on unmount", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(
      <DriveConflictModal
        drive={{ modifiedTime: "2026-01-01T00:00:00Z", deckCount: 1, cardCount: 1 }}
        local={{ deckCount: 1, cardCount: 1 }}
        onKeepDrive={vi.fn()} onKeepLocal={vi.fn()}
      />,
    );
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
