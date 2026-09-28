import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTrade, TRADE_STORAGE_KEY, emptyTrade } from "../hooks/useTrade";
import type { Trade, TradeCard } from "../../../types/trade";

const card = (over: Partial<Omit<TradeCard, "id">> = {}): Omit<TradeCard, "id"> => ({
  name: "Sol Ring", scryfallId: "s1", set: "cmd", collectorNumber: "1", finish: "nonfoil",
  condition: "NM", quantity: 1, basePrice: 10, priceFetchedAt: 0, source: "search", ...over,
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

beforeEach(() => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
    writable: true,
    configurable: true,
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("useTrade editing", () => {
  it("adds cards and merges identical lines", () => {
    const { result } = renderHook(() => useTrade());
    act(() => result.current.addCard("mine", card()));
    act(() => result.current.addCard("mine", card()));
    act(() => result.current.addCard("mine", card({ finish: "foil" })));
    expect(result.current.trade.mine.cards).toHaveLength(2);
    expect(result.current.trade.mine.cards[0].quantity).toBe(2);
  });

  it("updates, clamps quantity, and removes", () => {
    const { result } = renderHook(() => useTrade());
    act(() => result.current.addCard("theirs", card()));
    const id = result.current.trade.theirs.cards[0].id;
    act(() => result.current.updateCard("theirs", id, { quantity: 0, condition: "LP" }));
    expect(result.current.trade.theirs.cards[0]).toMatchObject({ quantity: 1, condition: "LP" });
    act(() => result.current.removeCard("theirs", id));
    expect(result.current.trade.theirs.cards).toHaveLength(0);
  });

  it("bulk-sets condition for one side only", () => {
    const { result } = renderHook(() => useTrade());
    act(() => result.current.addCard("mine", card()));
    act(() => result.current.addCard("theirs", card({ name: "Other", collectorNumber: "2" })));
    act(() => result.current.setSideCondition("mine", "MP"));
    expect(result.current.trade.mine.cards[0].condition).toBe("MP");
    expect(result.current.trade.theirs.cards[0].condition).toBe("NM");
  });

  it("manages cash lines and never goes negative", () => {
    const { result } = renderHook(() => useTrade());
    act(() => result.current.addCash("mine", 5));
    const id = result.current.trade.mine.cash[0].id;
    act(() => result.current.updateCash("mine", id, -3));
    expect(result.current.trade.mine.cash[0].amount).toBe(0);
    act(() => result.current.updateCash("mine", id, 7));
    expect(result.current.mineTotals.cashTotal).toBe(7);
    act(() => result.current.removeCash("mine", id));
    expect(result.current.trade.mine.cash).toHaveLength(0);
  });

  it("updates settings and side discount", () => {
    const { result } = renderHook(() => useTrade());
    act(() => result.current.setSettings({ discountPct: 20 }));
    act(() => result.current.setSideDiscount("mine", 5));
    expect(result.current.trade.settings).toEqual({ discountPct: 20, tolerancePct: 10 });
    expect(result.current.trade.mine.discountOverridePct).toBe(5);
  });

  it("swaps sides", () => {
    const { result } = renderHook(() => useTrade());
    act(() => result.current.addCard("mine", card()));
    act(() => result.current.swap());
    expect(result.current.trade.mine.cards).toHaveLength(0);
    expect(result.current.trade.theirs.cards).toHaveLength(1);
  });
});

describe("derived values", () => {
  it("is neutral until both sides have something, then reports fairness", () => {
    const { result } = renderHook(() => useTrade());
    act(() => result.current.addCard("mine", card()));
    expect(result.current.isNeutral).toBe(true);
    act(() => result.current.addCash("theirs", 9));
    expect(result.current.isNeutral).toBe(false);
    expect(result.current.fairness.band).toBe("fair");
  });

  it("counts missing prices across both sides", () => {
    const { result } = renderHook(() => useTrade());
    act(() => result.current.addCard("mine", card({ basePrice: null })));
    act(() => result.current.addCard("theirs", card({ basePrice: null, name: "B", collectorNumber: "2" })));
    expect(result.current.missingPriceCount).toBe(2);
  });
});

describe("undo / redo", () => {
  it("undoes and redoes Clear", () => {
    const { result } = renderHook(() => useTrade());
    act(() => result.current.addCard("mine", card()));
    act(() => result.current.clear());
    expect(result.current.trade.mine.cards).toHaveLength(0);
    act(() => result.current.undo());
    expect(result.current.trade.mine.cards).toHaveLength(1);
    act(() => result.current.redo());
    expect(result.current.trade.mine.cards).toHaveLength(0);
  });

  it("a new edit drops the redo stack; Clear on an empty trade is not an entry", () => {
    const { result } = renderHook(() => useTrade());
    act(() => result.current.clear());
    expect(result.current.canUndo).toBe(false);
    act(() => result.current.addCard("mine", card()));
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.addCash("mine", 1));
    expect(result.current.canRedo).toBe(false);
  });
});

describe("persistence", () => {
  it("saves and restores the local trade", () => {
    const first = renderHook(() => useTrade());
    act(() => first.result.current.addCard("mine", card()));
    first.unmount();
    const second = renderHook(() => useTrade());
    expect(second.result.current.trade.mine.cards).toHaveLength(1);
    expect(second.result.current.trade.readOnly).toBe(false);
  });

  it("falls back to empty on corrupt storage", () => {
    window.localStorage.setItem(TRADE_STORAGE_KEY, "{nope");
    const { result } = renderHook(() => useTrade());
    expect(result.current.trade).toEqual(emptyTrade());
  });
});

describe("share link open and fork", () => {
  const shared = (): Trade => ({
    ...emptyTrade(),
    theirs: { cards: [{ ...card({ scryfallId: "" }), id: "x" }], cash: [] },
  });

  it("a read-only trade ignores edits and never overwrites the local trade", () => {
    const local = renderHook(() => useTrade());
    act(() => local.result.current.addCard("mine", card({ name: "Local" })));
    local.unmount();

    const { result } = renderHook(() => useTrade(shared()));
    expect(result.current.trade.readOnly).toBe(true);
    act(() => result.current.addCard("mine", card()));
    act(() => result.current.clear());
    expect(result.current.trade.mine.cards).toHaveLength(0);
    expect(result.current.trade.theirs.cards).toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem(TRADE_STORAGE_KEY)!).mine.cards[0].name).toBe("Local");
  });

  it("fork makes an editable local copy and undo restores the replaced local trade", () => {
    const local = renderHook(() => useTrade());
    act(() => local.result.current.addCard("mine", card({ name: "Local" })));
    local.unmount();

    const { result } = renderHook(() => useTrade(shared()));
    expect(result.current.localTradeIsEmpty()).toBe(false);
    act(() => result.current.fork());
    expect(result.current.trade.readOnly).toBe(false);
    expect(result.current.trade.theirs.cards[0].id).not.toBe("x");
    expect(JSON.parse(window.localStorage.getItem(TRADE_STORAGE_KEY)!).theirs.cards).toHaveLength(1);
    act(() => result.current.undo());
    expect(result.current.trade.mine.cards[0].name).toBe("Local");
  });

  it("reports an empty local trade so fork can skip the confirm", () => {
    const { result } = renderHook(() => useTrade(shared()));
    expect(result.current.localTradeIsEmpty()).toBe(true);
  });

  it("open() swaps in a read-only trade and resets history", () => {
    const { result } = renderHook(() => useTrade());
    act(() => result.current.addCard("mine", card()));
    act(() => result.current.open(shared()));
    expect(result.current.trade.readOnly).toBe(true);
    expect(result.current.canUndo).toBe(false);
  });
});

describe("refreshPrices", () => {
  it("reprices found cards by set + number and flags the rest stale", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({
      data: [{ id: "new-id", name: "Sol Ring", set: "cmd", set_name: "Commander", collector_number: "1", finishes: ["nonfoil"], prices: { usd: "20.00" } }],
    })));
    const { result } = renderHook(() => useTrade());
    act(() => result.current.addCard("mine", card({ scryfallId: "" })));
    act(() => result.current.addCard("mine", card({ name: "Gone", collectorNumber: "99" })));
    await act(() => result.current.refreshPrices());
    const [found, gone] = result.current.trade.mine.cards;
    expect(found).toMatchObject({ basePrice: 20, scryfallId: "new-id" });
    expect(found.priceFetchedAt).toBeGreaterThan(0);
    expect(gone.basePrice).toBe(10);
    expect(result.current.staleIds.has(gone.id)).toBe(true);
    expect(result.current.staleIds.has(found.id)).toBe(false);
    await waitFor(() => expect(result.current.refreshStatus).toBe("idle"));
  });

  it("is disabled for read-only trades", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const t = { ...emptyTrade(), mine: { cards: [{ ...card(), id: "x" }], cash: [] } };
    const { result } = renderHook(() => useTrade(t));
    await act(() => result.current.refreshPrices());
    expect(f).not.toHaveBeenCalled();
  });

  it("does not add an undo entry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ data: [] })));
    const { result } = renderHook(() => useTrade());
    act(() => result.current.addCard("mine", card()));
    act(() => result.current.undo());
    act(() => result.current.redo());
    await act(() => result.current.refreshPrices());
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });
});
