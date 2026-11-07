import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useStorageSwapSync } from "../useStorageSwapSync";

describe("useStorageSwapSync", () => {
  it("reloads when another tab changes the demo flag", () => {
    const reload = vi.fn();
    renderHook(() => useStorageSwapSync(reload));
    window.dispatchEvent(new StorageEvent("storage", { key: "fetchlist:demo:active" }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("reloads when another tab refreshes the demo's sample data", () => {
    const reload = vi.fn();
    renderHook(() => useStorageSwapSync(reload));
    window.dispatchEvent(new StorageEvent("storage", { key: "fetchlist:demo:version" }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("reloads when another tab imports a backup", () => {
    const reload = vi.fn();
    renderHook(() => useStorageSwapSync(reload));
    window.dispatchEvent(new StorageEvent("storage", { key: "fetchlist:backup:imported" }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("ignores unrelated keys and stops listening on unmount", () => {
    const reload = vi.fn();
    const { unmount } = renderHook(() => useStorageSwapSync(reload));
    window.dispatchEvent(new StorageEvent("storage", { key: "mtg-checklist-decks" }));
    expect(reload).not.toHaveBeenCalled();
    unmount();
    window.dispatchEvent(new StorageEvent("storage", { key: "fetchlist:demo:active" }));
    expect(reload).not.toHaveBeenCalled();
  });
});
