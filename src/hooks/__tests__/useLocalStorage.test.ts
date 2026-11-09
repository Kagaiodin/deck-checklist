import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLocalStorage } from "../useLocalStorage";
import { MemoryStorage } from "../../features/demo/__tests__/memoryStorage";

let storage: MemoryStorage;
beforeEach(() => { storage = new MemoryStorage(); vi.stubGlobal("localStorage", storage); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("useLocalStorage", () => {
  it("starts from the saved value and saves every change", () => {
    storage.setItem("k", "[1]");
    const { result } = renderHook(() => useLocalStorage<number[]>("k", []));
    expect(result.current[0]).toEqual([1]);
    act(() => result.current[1](prev => [...prev, 2]));
    expect(storage.getItem("k")).toBe("[1,2]");
  });

  it("starts from the initial value when the saved value is null", () => {
    storage.setItem("k", "null");
    const { result } = renderHook(() => useLocalStorage<number[]>("k", []));
    expect(result.current[0]).toEqual([]);
  });
});
