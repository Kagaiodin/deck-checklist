import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDemoTabSync } from "../useDemoTabSync";

describe("useDemoTabSync", () => {
  it("reloads when another tab changes the demo flag", () => {
    const reload = vi.fn();
    renderHook(() => useDemoTabSync(reload));
    window.dispatchEvent(new StorageEvent("storage", { key: "fetchlist:demo:active" }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("ignores unrelated keys and stops listening on unmount", () => {
    const reload = vi.fn();
    const { unmount } = renderHook(() => useDemoTabSync(reload));
    window.dispatchEvent(new StorageEvent("storage", { key: "mtg-checklist-decks" }));
    expect(reload).not.toHaveBeenCalled();
    unmount();
    window.dispatchEvent(new StorageEvent("storage", { key: "fetchlist:demo:active" }));
    expect(reload).not.toHaveBeenCalled();
  });
});
