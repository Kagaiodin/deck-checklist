import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCollectionSort } from "../useCollectionSort";
import type { Collection } from "../../../../types/index";

const collection: Collection = {
  "lightning bolt": [{ quantity: 4 }],
  "counterspell": [{ quantity: 1 }, { quantity: 2, foil: true }],
  "sol ring": [{ quantity: 1 }],
};

const names = (r: { current: { collectionFiltered: { name: string }[] } }) =>
  r.current.collectionFiltered.map(e => e.name);

describe("useCollectionSort", () => {
  it("sorts by name ascending by default and totals quantities", () => {
    const { result } = renderHook(() => useCollectionSort(collection, ""));
    expect(names(result)).toEqual(["counterspell", "lightning bolt", "sol ring"]);
    expect(result.current.collectionFiltered[0].total).toBe(3);
  });

  it("sorts by name descending", () => {
    const { result } = renderHook(() => useCollectionSort(collection, ""));
    act(() => result.current.setCollectionSort("name-desc"));
    expect(names(result)).toEqual(["sol ring", "lightning bolt", "counterspell"]);
  });

  it("sorts by quantity descending with name tiebreak", () => {
    const { result } = renderHook(() => useCollectionSort(collection, ""));
    act(() => result.current.setCollectionSort("qty-desc"));
    expect(names(result)).toEqual(["lightning bolt", "counterspell", "sol ring"]);
  });

  it("sorts by quantity ascending with name tiebreak", () => {
    const { result } = renderHook(() => useCollectionSort(collection, ""));
    act(() => result.current.setCollectionSort("qty-asc"));
    expect(names(result)).toEqual(["sol ring", "counterspell", "lightning bolt"]);
  });

  it("filters by case-insensitive search term", () => {
    const { result } = renderHook(() => useCollectionSort(collection, "BOLT"));
    expect(names(result)).toEqual(["lightning bolt"]);
  });

  it("treats non-array printings as empty", () => {
    const bad = { weird: 3 } as unknown as Collection;
    const { result } = renderHook(() => useCollectionSort(bad, ""));
    expect(result.current.collectionFiltered[0]).toEqual({ name: "weird", printings: [], total: 0 });
  });
});
