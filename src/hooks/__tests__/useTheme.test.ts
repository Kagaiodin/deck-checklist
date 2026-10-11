import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "../useTheme";

// Node's built-in localStorage can shadow jsdom's; use an in-memory mock
// (same approach as useBuyFlow.test.ts).
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

describe("useTheme", () => {
  beforeEach(() => {
    installLocalStorageMock();
    document.documentElement.removeAttribute("data-mode");
    document.documentElement.removeAttribute("data-accent");
  });

  it("defaults to dark/indigo and applies attributes to <html>", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.mode).toBe("dark");
    expect(result.current.accent).toBe("indigo");
    expect(document.documentElement.getAttribute("data-mode")).toBe("dark");
    expect(document.documentElement.getAttribute("data-accent")).toBe("indigo");
  });

  it("restores saved mode and accent from localStorage", () => {
    localStorage.setItem("fl-theme-mode", "light");
    localStorage.setItem("fl-theme-accent", "ember");
    const { result } = renderHook(() => useTheme());
    expect(result.current.mode).toBe("light");
    expect(result.current.accent).toBe("ember");
  });

  it("toggleMode flips between dark and light and persists", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggleMode());
    expect(result.current.mode).toBe("light");
    expect(localStorage.getItem("fl-theme-mode")).toBe("light");
    expect(document.documentElement.getAttribute("data-mode")).toBe("light");
    act(() => result.current.toggleMode());
    expect(result.current.mode).toBe("dark");
  });

  it("setAccent and setMode update state, DOM and storage", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setAccent("emerald"));
    act(() => result.current.setMode("light"));
    expect(document.documentElement.getAttribute("data-accent")).toBe("emerald");
    expect(localStorage.getItem("fl-theme-accent")).toBe("emerald");
    expect(localStorage.getItem("fl-theme-mode")).toBe("light");
  });
});
