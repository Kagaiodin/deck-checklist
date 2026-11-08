import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useReloadOnOtherTabWrite } from "../useReloadOnOtherTabWrite";

const KEYS = ["watched-a", "watched-b"];

describe("useReloadOnOtherTabWrite", () => {
  it("reloads when another tab writes a watched key", () => {
    const reload = vi.fn();
    renderHook(() => useReloadOnOtherTabWrite(KEYS, reload));
    window.dispatchEvent(new StorageEvent("storage", { key: "watched-b" }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("ignores other keys and a cleared storage, and stops listening on unmount", () => {
    const reload = vi.fn();
    const { unmount } = renderHook(() => useReloadOnOtherTabWrite(KEYS, reload));
    window.dispatchEvent(new StorageEvent("storage", { key: "mtg-checklist-decks" }));
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(reload).not.toHaveBeenCalled();
    unmount();
    window.dispatchEvent(new StorageEvent("storage", { key: "watched-a" }));
    expect(reload).not.toHaveBeenCalled();
  });
});
