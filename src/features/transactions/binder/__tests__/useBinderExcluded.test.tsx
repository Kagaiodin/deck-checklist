import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBinderExcluded, useBinderExcludedList, writeBinderExcluded } from "../useBinder";
import { sanitizeExcluded } from "../../../../utils/binderExcluded";

beforeEach(() => {
  const store = new Map<string, string>();
  const mock = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear() };
  for (const t of [globalThis, window]) Object.defineProperty(t, "localStorage", { value: mock, writable: true, configurable: true });
});

describe("Binder exclude list store", () => {
  it("keeps every reader current: an exclusion made in one is seen by another straight away", () => {
    const binder = renderHook(() => useBinderExcluded());
    const backup = renderHook(() => useBinderExcludedList());
    act(() => binder.result.current.exclude("sol ring"));
    expect(backup.result.current).toEqual(["sol ring"]);
    act(() => binder.result.current.restore("sol ring"));
    expect(backup.result.current).toEqual([]);
  });

  it("an imported list shows up in a mounted Binder, and the next toggle builds on it", () => {
    const binder = renderHook(() => useBinderExcluded());
    act(() => writeBinderExcluded(["mana crypt"]));
    expect(binder.result.current.excluded.has("mana crypt")).toBe(true);
    act(() => binder.result.current.exclude("sol ring"));
    expect([...binder.result.current.excluded].sort()).toEqual(["mana crypt", "sol ring"]);
  });

  it("ignores non-string entries from a backup", () => {
    expect(sanitizeExcluded(["a", 3, null, "b"])).toEqual(["a", "b"]);
    expect(sanitizeExcluded({})).toEqual([]);
  });
});
