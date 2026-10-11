import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMediaQuery } from "../useMediaQuery";

function stubMatchMedia(initial: boolean) {
  let handler: ((e: MediaQueryListEvent) => void) | null = null;
  const removeEventListener = vi.fn();
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: initial,
    addEventListener: (_: string, h: (e: MediaQueryListEvent) => void) => { handler = h; },
    removeEventListener,
  })));
  return {
    fire: (matches: boolean) => handler?.({ matches } as MediaQueryListEvent),
    removeEventListener,
  };
}

describe("useMediaQuery", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("returns the initial match state", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery("(min-width: 800px)"));
    expect(result.current).toBe(true);
  });

  it("updates when the query changes", () => {
    const mq = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(min-width: 800px)"));
    act(() => mq.fire(true));
    expect(result.current).toBe(true);
  });

  it("removes its listener on unmount", () => {
    const mq = stubMatchMedia(false);
    const { unmount } = renderHook(() => useMediaQuery("(min-width: 800px)"));
    unmount();
    expect(mq.removeEventListener).toHaveBeenCalled();
  });
});
