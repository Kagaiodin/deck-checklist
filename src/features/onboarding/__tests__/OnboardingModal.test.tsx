import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingModal } from "../OnboardingModal";

describe("OnboardingModal", () => {
  it("renders an accessible dialog and focuses the close button", () => {
    render(<OnboardingModal onDismiss={vi.fn()} onImportDeck={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Track every card you need" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close onboarding" })).toHaveFocus();
  });

  it("Import a deck calls onImportDeck", async () => {
    const onImportDeck = vi.fn();
    const onDismiss = vi.fn();
    render(<OnboardingModal onDismiss={onDismiss} onImportDeck={onImportDeck} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Import a deck" }));
    expect(onImportDeck).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("Skip and the close button dismiss", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<OnboardingModal onDismiss={onDismiss} onImportDeck={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    await user.click(screen.getByRole("button", { name: "Close onboarding" }));
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it("Escape dismisses", () => {
    const onDismiss = vi.fn();
    render(<OnboardingModal onDismiss={onDismiss} onImportDeck={vi.fn()} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("clicking the backdrop dismisses, clicking inside the modal does not", () => {
    const onDismiss = vi.fn();
    const { container } = render(<OnboardingModal onDismiss={onDismiss} onImportDeck={vi.fn()} />);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector(".onboarding-backdrop")!);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("traps Tab focus: last → first and Shift+Tab first → last", () => {
    render(<OnboardingModal onDismiss={vi.fn()} onImportDeck={vi.fn()} />);
    const close = screen.getByRole("button", { name: "Close onboarding" });
    const skip = screen.getByRole("button", { name: "Skip for now" });

    skip.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();

    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(skip).toHaveFocus();
  });

  it("restores focus to the previously focused element on unmount", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(<OnboardingModal onDismiss={vi.fn()} onImportDeck={vi.fn()} />);
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
