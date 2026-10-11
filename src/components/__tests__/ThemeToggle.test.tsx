import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "../ThemeToggle";

// Node's built-in localStorage can shadow jsdom's; use an in-memory mock.
function installLocalStorageMock() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => store.clear(),
    },
    writable: true,
    configurable: true,
  });
}

describe("ThemeToggle", () => {
  beforeEach(() => installLocalStorageMock());

  it("is closed by default and opens on click", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Appearance settings" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("switches mode to light", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: "Appearance settings" }));
    await user.click(screen.getByRole("radio", { name: /Light/ }));
    expect(screen.getByRole("radio", { name: /Light/ })).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.getAttribute("data-mode")).toBe("light");
  });

  it("selects an accent", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: "Appearance settings" }));
    await user.click(screen.getByRole("radio", { name: "Emerald" }));
    expect(screen.getByRole("radio", { name: "Emerald" })).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.getAttribute("data-accent")).toBe("emerald");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: "Appearance settings" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on outside click but not on inside click", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: "Appearance settings" }));
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
