import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { collectionStore, createCollectionStore, mergeCollections, resetForTests, useCollection, type CollectionStorage } from "../collection";
import { COLLECTION_KEY, COLLECTION_META_KEY } from "../../features/collection/storageKeys";
import type { Collection, CollectionMeta } from "../../types/index";

/** In-memory stand-in for the two localStorage keys. */
function fakeStorage(seed: { collection?: string | null; meta?: string | null } = {}) {
  const data = { collection: seed.collection ?? null, meta: seed.meta ?? null };
  const storage: CollectionStorage = {
    loadCollection: vi.fn(() => data.collection),
    loadMeta: vi.fn(() => data.meta),
    saveCollection: vi.fn((v: string) => { data.collection = v; }),
    saveMeta: vi.fn((v: string) => { data.meta = v; }),
  };
  return { storage, data };
}

const bolt: Collection = { "lightning bolt": [{ quantity: 4 }] };
const meta: CollectionMeta = { fileName: "mine.csv", importedAt: 42, cardCount: 1 };

describe("createCollectionStore — loading", () => {
  it("reads nothing until the first read", () => {
    const { storage } = fakeStorage();
    createCollectionStore(storage);
    expect(storage.loadCollection).not.toHaveBeenCalled();
    expect(storage.loadMeta).not.toHaveBeenCalled();
  });

  it("sees values written to storage after it was created but before the first read", () => {
    const { storage, data } = fakeStorage();
    const store = createCollectionStore(storage);
    data.collection = JSON.stringify(bolt);
    data.meta = JSON.stringify(meta);
    expect(store.get()).toEqual(bolt);
    expect(store.getMeta()).toEqual(meta);
  });

  it("starts empty when storage is empty, unreadable or holds junk", () => {
    expect(createCollectionStore(fakeStorage().storage).get()).toEqual({});
    expect(createCollectionStore(fakeStorage({ collection: "{nope" }).storage).get()).toEqual({});
    expect(createCollectionStore(fakeStorage({ meta: "null" }).storage).getMeta()).toBeNull();
    const throwing: CollectionStorage = {
      loadCollection: () => { throw new Error("blocked"); },
      loadMeta: () => { throw new Error("blocked"); },
      saveCollection: () => {}, saveMeta: () => {},
    };
    expect(createCollectionStore(throwing).get()).toEqual({});
    expect(createCollectionStore(throwing).getMeta()).toBeNull();
  });

  it("reads storage once, then serves the in-memory value", () => {
    const { storage, data } = fakeStorage({ collection: JSON.stringify(bolt) });
    const store = createCollectionStore(storage);
    store.get();
    data.collection = JSON.stringify({});
    expect(store.get()).toEqual(bolt);
    expect(storage.loadCollection).toHaveBeenCalledTimes(1);
  });
});

describe("createCollectionStore — update", () => {
  const addRing = (c: Collection): Collection => ({ ...c, "sol ring": [{ quantity: 1 }] });

  it("applies the change, saves both keys at once and recounts cardCount on existing meta", () => {
    const { storage, data } = fakeStorage({ collection: JSON.stringify(bolt), meta: JSON.stringify(meta) });
    const store = createCollectionStore(storage);
    store.update(addRing);
    expect(Object.keys(store.get()).sort()).toEqual(["lightning bolt", "sol ring"]);
    expect(store.getMeta()).toEqual({ fileName: "mine.csv", importedAt: 42, cardCount: 2 });
    expect(JSON.parse(data.collection!)).toEqual(store.get());
    expect(JSON.parse(data.meta!)).toEqual(store.getMeta());
  });

  it("keeps the existing fileName even when a source is given", () => {
    const store = createCollectionStore(fakeStorage({ meta: JSON.stringify(meta) }).storage);
    store.update(addRing, { source: "Order receipt" });
    expect(store.getMeta()).toMatchObject({ fileName: "mine.csv", importedAt: 42, cardCount: 1 });
  });

  it("creates meta named after the source when there is none", () => {
    vi.useFakeTimers().setSystemTime(1000);
    const store = createCollectionStore(fakeStorage().storage);
    store.update(addRing, { source: "Trade log" });
    expect(store.getMeta()).toEqual({ fileName: "Trade log", importedAt: 1000, cardCount: 1 });
    vi.useRealTimers();
  });

  it("leaves meta absent when there is none and no source", () => {
    const store = createCollectionStore(fakeStorage().storage);
    store.update(addRing);
    expect(store.get()).toHaveProperty(["sol ring"]);
    expect(store.getMeta()).toBeNull();
  });

  it("keeps the in-memory value when storage is full", () => {
    const { storage } = fakeStorage();
    storage.saveCollection = () => { throw new Error("QuotaExceededError"); };
    const store = createCollectionStore(storage);
    expect(() => store.update(addRing)).not.toThrow();
    expect(store.get()).toHaveProperty(["sol ring"]);
  });
});

describe("createCollectionStore — replace and subscribe", () => {
  it("replace sets both values as given and saves them", () => {
    const { storage, data } = fakeStorage({ collection: JSON.stringify(bolt), meta: JSON.stringify(meta) });
    const store = createCollectionStore(storage);
    store.replace({}, null);
    expect(store.get()).toEqual({});
    expect(store.getMeta()).toBeNull();
    expect(data.collection).toBe("{}");
    expect(data.meta).toBe("null");
  });

  it("tells subscribers after each change, and stops after unsubscribing", () => {
    const store = createCollectionStore(fakeStorage().storage);
    const cb = vi.fn();
    const unsubscribe = store.subscribe(cb);
    store.update(c => ({ ...c, "sol ring": [{ quantity: 1 }] }));
    store.replace(bolt, meta);
    expect(cb).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.replace({}, null);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("stays quiet when nothing changed", () => {
    const store = createCollectionStore(fakeStorage({ collection: JSON.stringify(bolt) }).storage);
    const cb = vi.fn();
    store.subscribe(cb);
    store.update(c => c);
    store.replace(store.get(), store.getMeta());
    expect(cb).not.toHaveBeenCalled();
  });

  it("subscribers read the new value", () => {
    const store = createCollectionStore(fakeStorage().storage);
    let seen: Collection | undefined;
    store.subscribe(() => { seen = store.get(); });
    store.replace(bolt, meta);
    expect(seen).toEqual(bolt);
  });

  it("returns the same snapshot object until something changes", () => {
    const store = createCollectionStore(fakeStorage().storage);
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    store.replace(bolt, meta);
    expect(store.getSnapshot()).not.toBe(first);
    expect(store.getSnapshot()).toEqual({ collection: bolt, meta });
  });
});

describe("createCollectionStore — set codes", () => {
  it("uppercases set codes it loads, merging printings that only differed in case into the larger", () => {
    const stored: Collection = {
      "counterspell": [
        { quantity: 1, set: "mh2", collectorNumber: "267" },
        { quantity: 3, set: "MH2", collectorNumber: "267" },
        { quantity: 2, set: "mh2", collectorNumber: "267", foil: true },
      ],
      "sol ring": [{ quantity: 1 }],
    };
    const store = createCollectionStore(fakeStorage({ collection: JSON.stringify(stored) }).storage);
    expect(store.get()).toEqual({
      "counterspell": [
        { quantity: 3, set: "MH2", collectorNumber: "267" },
        { quantity: 2, set: "MH2", collectorNumber: "267", foil: true },
      ],
      "sol ring": [{ quantity: 1 }],
    });
  });

  it("merges a case variant into one twin only, and never merges printings that already shared a case", () => {
    const stored: Collection = {
      "counterspell": [
        { quantity: 1, set: "mh2", collectorNumber: "267" },
        { quantity: 2, set: "MH2", collectorNumber: "267" },
        { quantity: 3, set: "MH2", collectorNumber: "267" },
      ],
    };
    const store = createCollectionStore(fakeStorage({ collection: JSON.stringify(stored) }).storage);
    expect(store.get()["counterspell"]).toEqual([
      { quantity: 2, set: "MH2", collectorNumber: "267" },
      { quantity: 3, set: "MH2", collectorNumber: "267" },
    ]);
  });

  it("uppercases set codes on update and replace", () => {
    const { storage, data } = fakeStorage();
    const store = createCollectionStore(storage);
    store.update(() => ({ "sol ring": [{ quantity: 1, set: "c21", collectorNumber: "263" }] }));
    expect(store.get()["sol ring"]).toEqual([{ quantity: 1, set: "C21", collectorNumber: "263" }]);
    expect(JSON.parse(data.collection!)["sol ring"][0].set).toBe("C21");

    store.replace({ "counterspell": [{ quantity: 1, set: "mh2" }] }, null);
    expect(store.get()["counterspell"]).toEqual([{ quantity: 1, set: "MH2" }]);
  });

  it("hands back the Collection it was given when the set codes are already uppercase", () => {
    const store = createCollectionStore(fakeStorage().storage);
    const next: Collection = { "sol ring": [{ quantity: 1, set: "C21" }] };
    store.update(() => next);
    expect(store.get()).toBe(next);
  });
});

describe("mergeCollections", () => {
  it("adds new cards and new printings, keeps the base copy of a printing both sides have", () => {
    const base: Collection = {
      "lightning bolt": [{ quantity: 4 }],
      "counterspell": [{ quantity: 1, set: "MH2" }],
    };
    const incoming: Collection = {
      "counterspell": [{ quantity: 9, set: "MH2" }, { quantity: 2, set: "MH2", foil: true }],
      "sol ring": [{ quantity: 1 }],
    };
    const { merged, added } = mergeCollections(base, incoming);
    expect(merged).toEqual({
      "lightning bolt": [{ quantity: 4 }],
      "counterspell": [{ quantity: 1, set: "MH2" }, { quantity: 2, set: "MH2", foil: true }],
      "sol ring": [{ quantity: 1 }],
    });
    expect(added).toBe(1);
    expect(base["counterspell"]).toHaveLength(1);
  });

  it("counts a card as new when the base only has an empty entry for it", () => {
    expect(mergeCollections({ "sol ring": [] }, { "sol ring": [{ quantity: 1 }] }).added).toBe(1);
  });

  it("keeps one copy of a printing whose set case differs between the two sides", () => {
    const base: Collection = { "counterspell": [{ quantity: 1, set: "mh2", collectorNumber: "267" }] };
    const incoming: Collection = { "counterspell": [{ quantity: 1, set: "MH2", collectorNumber: "267" }] };
    expect(mergeCollections(base, incoming).merged["counterspell"]).toHaveLength(1);
  });
});

describe("collectionStore and useCollection", () => {
  function installStorage(seed: Record<string, string> = {}) {
    const data = new Map(Object.entries(seed));
    Object.defineProperty(globalThis, "localStorage", {
      value: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) },
      writable: true, configurable: true,
    });
    return data;
  }

  it("reads localStorage lazily, after a reset", () => {
    installStorage({ [COLLECTION_KEY]: JSON.stringify(bolt), [COLLECTION_META_KEY]: JSON.stringify(meta) });
    resetForTests();
    expect(collectionStore.get()).toEqual(bolt);
    expect(collectionStore.getMeta()).toEqual(meta);
  });

  it("re-renders hook users when the Collection changes, and writes through to localStorage", () => {
    const data = installStorage();
    resetForTests();
    const { result } = renderHook(() => useCollection());
    expect(result.current).toEqual({ collection: {}, meta: null });
    act(() => collectionStore.update(() => bolt, { source: "Manual entries" }));
    expect(result.current.collection).toEqual(bolt);
    expect(result.current.meta).toMatchObject({ fileName: "Manual entries", cardCount: 1 });
    expect(JSON.parse(data.get(COLLECTION_KEY)!)).toEqual(bolt);
  });
});
