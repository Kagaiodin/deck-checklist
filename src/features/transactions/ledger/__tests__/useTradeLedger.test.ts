import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTradeLedger, TRADE_LEDGER_KEY } from "../useTradeLedger";
import { DEFAULT_SETTINGS, type Trade, type TradeCard } from "../../../../types/trade";
import type { CollectionMeta } from "../../../../types/index";
import { memoryCollectionStore } from "../../../../test/memoryCollectionStore";

let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear() },
    writable: true, configurable: true,
  });
});

const card: TradeCard = { id: "i", name: "Sol Ring", scryfallId: "x", set: "cmm", collectorNumber: "410", finish: "nonfoil", condition: "NM", quantity: 1, basePrice: 10, priceFetchedAt: 0, source: "search" };
const trade: Trade = { mine: { cards: [card], cash: [] }, theirs: { cards: [], cash: [] }, settings: { ...DEFAULT_SETTINGS }, readOnly: false };

function setup(meta: CollectionMeta | null = null) {
  const deps = { collectionStore: memoryCollectionStore({ "sol ring": [{ quantity: 2 }] }, meta) };
  return { deps, ...renderHook(() => useTradeLedger(deps)) };
}

describe("useTradeLedger", () => {
  it("starts empty", () => {
    expect(setup().result.current.entries).toEqual([]);
  });

  it("logTrade records the entry and applies it to the Collection", () => {
    const { result, deps } = setup();
    let out!: ReturnType<typeof result.current.logTrade>;
    act(() => { out = result.current.logTrade(trade, { date: 5, counterparty: "Sam", notes: "" }); });
    expect(result.current.entries).toHaveLength(1);
    expect(JSON.parse(store.get(TRADE_LEDGER_KEY)!)[0]).toMatchObject({ counterparty: "Sam" });
    expect(out.shortfall).toEqual([]);
    expect(deps.collectionStore.get()).toEqual({ "sol ring": [{ quantity: 1 }] });
  });

  it("keeps stored import metadata and only updates the card count", () => {
    const { result, deps } = setup({ fileName: "mine.csv", importedAt: 42, cardCount: 9 });
    act(() => { result.current.logTrade(trade, { date: 5, counterparty: "", notes: "" }); });
    expect(deps.collectionStore.getMeta()).toEqual({ fileName: "mine.csv", importedAt: 42, cardCount: 1 });
  });

  it("falls back to a 'Trade log' meta when no collection was ever imported", () => {
    const { result, deps } = setup();
    act(() => { result.current.logTrade(trade, { date: 5, counterparty: "", notes: "" }); });
    expect(deps.collectionStore.getMeta()).toEqual(expect.objectContaining({ fileName: "Trade log", cardCount: 1 }));
  });

  it("deleteEntry removes the entry without touching the Collection", () => {
    const { result, deps } = setup();
    let id = "";
    act(() => { id = result.current.logTrade(trade, { date: 5, counterparty: "", notes: "" }).entry.id; });
    const before = deps.collectionStore.getSnapshot();
    act(() => result.current.deleteEntry(id));
    expect(result.current.entries).toEqual([]);
    expect(deps.collectionStore.getSnapshot()).toBe(before);
  });
});
