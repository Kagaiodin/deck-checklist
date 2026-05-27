import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBuyFlow, VENDORS } from "../useBuyFlow";
import type { Card, Order } from "../../../types/index";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "card-1",
    name: "Lightning Bolt",
    quantity: 4,
    acquired: false,
    color: ["R"],
    type: "Instant",
    source: "need_to_buy",
    ...overrides,
  };
}

const MANAPOOL_ID = "manapool";
const TCGPLAYER_ID = "tcgplayer";

// ── localStorage mock ─────────────────────────────────────────────────────────

function makeLocalStorageMock() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, val: string) => { store[key] = val; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
    store,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useBuyFlow", () => {
  let createdOrders: Order[];
  let onCreateOrder: (order: Order) => void;
  let onViewOrder: () => void;
  let nextOrderId: () => string;
  let localStorageMock: ReturnType<typeof makeLocalStorageMock>;

  const cards = [makeCard(), makeCard({ id: "card-2", name: "Sol Ring", quantity: 1 })];

  beforeEach(() => {
    createdOrders = [];
    onCreateOrder = vi.fn((order: Order) => createdOrders.push(order));
    onViewOrder = vi.fn();
    nextOrderId = vi.fn(() => "order-test-1");

    localStorageMock = makeLocalStorageMock();
    Object.defineProperty(globalThis, "localStorage", {
      value: localStorageMock,
      writable: true,
    });

    // Default: window.open returns a fake window object (not blocked)
    vi.stubGlobal("window", {
      ...globalThis.window,
      open: vi.fn(() => ({ closed: false })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function renderBuyFlow(overrides: { cards?: Card[] } = {}) {
    return renderHook(() =>
      useBuyFlow({
        toBuyCards: overrides.cards ?? cards,
        deckId: "deck-1",
        onCreateOrder,
        onViewOrder,
        nextOrderId,
      })
    );
  }

  // ── Sheet open/close ────────────────────────────────────────────────────────

  it("starts with sheet closed and idle send state", () => {
    const { result } = renderBuyFlow();
    expect(result.current.buySheetOpen).toBe(false);
    expect(result.current.sendState).toBe("idle");
  });

  it("openBuySheet opens the sheet and resets state", () => {
    const { result } = renderBuyFlow();
    act(() => result.current.openBuySheet());
    expect(result.current.buySheetOpen).toBe(true);
    expect(result.current.sendState).toBe("idle");
    expect(result.current.errorType).toBeNull();
    expect(result.current.createdOrderId).toBeNull();
  });

  it("closeBuySheet closes the sheet and clears all state", () => {
    const { result } = renderBuyFlow();
    act(() => result.current.openBuySheet());
    act(() => result.current.closeBuySheet());
    expect(result.current.buySheetOpen).toBe(false);
    expect(result.current.vendorPickerOpen).toBe(false);
    expect(result.current.sendState).toBe("idle");
  });

  // ── Vendor picker ───────────────────────────────────────────────────────────

  it("openVendorPicker / closeVendorPicker toggle picker state", () => {
    const { result } = renderBuyFlow();
    act(() => result.current.openVendorPicker());
    expect(result.current.vendorPickerOpen).toBe(true);
    act(() => result.current.closeVendorPicker());
    expect(result.current.vendorPickerOpen).toBe(false);
  });

  it("confirmVendor persists lastVendor to localStorage and closes picker", () => {
    const { result } = renderBuyFlow();
    act(() => result.current.openVendorPicker());
    act(() => result.current.confirmVendor(MANAPOOL_ID));
    expect(result.current.selectedVendorId).toBe(MANAPOOL_ID);
    expect(result.current.vendorPickerOpen).toBe(false);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "fetchlist-last-vendor",
      MANAPOOL_ID
    );
  });

  // ── Manapool: success ───────────────────────────────────────────────────────

  it("handleSend with Manapool opens a tab and creates an order draft", async () => {
    const mockOpen = vi.fn(() => ({ closed: false }));
    vi.stubGlobal("window", { ...globalThis.window, open: mockOpen });

    const { result } = renderBuyFlow();
    await act(() => result.current.handleSend(MANAPOOL_ID));

    expect(result.current.sendState).toBe("success");
    expect(result.current.errorType).toBeNull();

    // Tab was opened
    expect(mockOpen).toHaveBeenCalledOnce();
    const [url, target] = mockOpen.mock.calls[0] as unknown as [string, string];
    expect(url).toContain("manapool.com/add-deck");
    expect(url).toContain("?deck=");
    expect(target).toBe("_blank");

    // Order draft was created
    expect(createdOrders).toHaveLength(1);
    const draft = createdOrders[0];
    expect(draft.vendor).toBe("Manapool");
    expect(draft.status).toBe("active");
    expect(draft.cards).toHaveLength(cards.length);
    expect(draft.cards[0].cardName).toBe("Lightning Bolt");
    expect(draft.cards[0].quantity).toBe(4);
    expect(draft.cards[0].deckId).toBe("deck-1");

    // createdOrderId is set
    expect(result.current.createdOrderId).toBe("order-test-1");

    // lastVendor + vendorLastUsed persisted
    expect(localStorageMock.setItem).toHaveBeenCalledWith("fetchlist-last-vendor", MANAPOOL_ID);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "fetchlist-vendor-last-used",
      expect.stringContaining(MANAPOOL_ID)
    );
  });

  // ── Manapool: popup blocked ─────────────────────────────────────────────────

  it("handleSend with Manapool sets popup-blocked error when window.open returns null", async () => {
    vi.stubGlobal("window", { ...globalThis.window, open: vi.fn(() => null) });

    const { result } = renderBuyFlow();
    await act(() => result.current.handleSend(MANAPOOL_ID));

    expect(result.current.sendState).toBe("error");
    expect(result.current.errorType).toBe("popup-blocked");
    expect(result.current.sendUrl).toContain("manapool.com/add-deck");

    // No order draft created
    expect(createdOrders).toHaveLength(0);
    expect(result.current.createdOrderId).toBeNull();
  });

  it("handleSend with Manapool sets popup-blocked when win.closed is true", async () => {
    vi.stubGlobal("window", { ...globalThis.window, open: vi.fn(() => ({ closed: true })) });

    const { result } = renderBuyFlow();
    await act(() => result.current.handleSend(MANAPOOL_ID));

    expect(result.current.sendState).toBe("error");
    expect(result.current.errorType).toBe("popup-blocked");
    expect(createdOrders).toHaveLength(0);
  });

  // ── TCGPlayer: clipboard success ────────────────────────────────────────────

  it("handleSend with TCGPlayer writes to clipboard and creates an order draft", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(globalThis, "navigator", {
      value: { ...globalThis.navigator, clipboard: { writeText } },
      writable: true,
    });

    const { result } = renderBuyFlow();
    await act(() => result.current.handleSend(TCGPLAYER_ID));

    expect(result.current.sendState).toBe("success");
    expect(result.current.errorType).toBeNull();

    // Clipboard was written with formatted list
    expect(writeText).toHaveBeenCalledOnce();
    const written = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(written).toContain("4 Lightning Bolt");
    expect(written).toContain("1 Sol Ring");

    // Order draft created for TCGPlayer
    expect(createdOrders).toHaveLength(1);
    expect(createdOrders[0].vendor).toBe("TCGPlayer");
    expect(createdOrders[0].status).toBe("active");
  });

  // ── TCGPlayer: clipboard denied ─────────────────────────────────────────────

  it("handleSend with TCGPlayer sets clipboard-denied error on NotAllowedError", async () => {
    const writeText = vi.fn(() =>
      Promise.reject(new DOMException("denied", "NotAllowedError"))
    );
    Object.defineProperty(globalThis, "navigator", {
      value: { ...globalThis.navigator, clipboard: { writeText } },
      writable: true,
    });

    const { result } = renderBuyFlow();
    await act(() => result.current.handleSend(TCGPLAYER_ID));

    expect(result.current.sendState).toBe("error");
    expect(result.current.errorType).toBe("clipboard-denied");

    // Fallback text is populated with the card list
    expect(result.current.clipboardText).toContain("Lightning Bolt");
    expect(result.current.clipboardText).toContain("Sol Ring");

    // No order draft
    expect(createdOrders).toHaveLength(0);
    expect(result.current.createdOrderId).toBeNull();
  });

  // ── Vendor last-used ────────────────────────────────────────────────────────

  it("getVendorLastUsedMap returns an empty map when nothing is stored", () => {
    const { result } = renderBuyFlow();
    expect(result.current.getVendorLastUsedMap()).toEqual({});
  });

  it("after a successful send, vendorLastUsed map includes the used vendor", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(globalThis, "navigator", {
      value: { ...globalThis.navigator, clipboard: { writeText } },
      writable: true,
    });

    const { result } = renderBuyFlow();
    await act(() => result.current.handleSend(TCGPLAYER_ID));

    // localStorage was updated
    const calls = localStorageMock.setItem.mock.calls as [string, string][];
    const lastUsedCall = calls.find(([key]) => key === "fetchlist-vendor-last-used");
    expect(lastUsedCall).toBeDefined();
    const map = JSON.parse(lastUsedCall![1]) as Record<string, number>;
    expect(map[TCGPLAYER_ID]).toBeGreaterThan(0);
  });

  // ── Other / Local store vendor ──────────────────────────────────────────────

  it("handleSend with Other copies to clipboard, creates draft, opens no tab", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const mockOpen = vi.fn(() => ({ closed: false }));
    Object.defineProperty(globalThis, "navigator", {
      value: { ...globalThis.navigator, clipboard: { writeText } },
      writable: true,
    });
    vi.stubGlobal("window", { ...globalThis.window, open: mockOpen });

    const { result } = renderBuyFlow();
    await act(() => result.current.handleSend("other"));

    // Clipboard was written
    expect(writeText).toHaveBeenCalledOnce();

    // No tab opened
    expect(mockOpen).not.toHaveBeenCalled();

    // Success state reached
    expect(result.current.sendState).toBe("success");

    // Order draft created
    expect(createdOrders).toHaveLength(1);
    expect(createdOrders[0].vendor).toBe("Other / Local store");
    expect(createdOrders[0].status).toBe("active");
  });

  it("Other vendor has an empty url", () => {
    const other = VENDORS.find(v => v.id === "other")!;
    expect(other.url).toBe("");
    expect(other.prefill).toBe(false);
  });

  // ── VENDORS constant ────────────────────────────────────────────────────────

  it("VENDORS contains Manapool, TCGPlayer, Card Kingdom, and Other", () => {
    const ids = VENDORS.map(v => v.id);
    expect(ids).toContain("manapool");
    expect(ids).toContain("tcgplayer");
    expect(ids).toContain("card_kingdom");
    expect(ids).toContain("other");
  });

  it("Manapool vendor has prefill:true, all others have prefill:false", () => {
    const manapool = VENDORS.find(v => v.id === "manapool")!;
    const rest = VENDORS.filter(v => v.id !== "manapool");
    expect(manapool.prefill).toBe(true);
    rest.forEach(v => expect(v.prefill).toBe(false));
  });
});
