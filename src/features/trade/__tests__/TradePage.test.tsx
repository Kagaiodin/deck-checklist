import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TradePage } from "../TradePage";
import { TRADE_STORAGE_KEY } from "../hooks/useTrade";
import * as scryfall from "../../../utils/scryfallSearch";
import { encodeTrade } from "../../../utils/tradeShare";
import { DEFAULT_SETTINGS, type Trade, type TradeCard, type TradeSide } from "../../../types/trade";
import type { Collection, Deck } from "../../../types/index";

vi.mock("../../../utils/scryfallSearch", async (orig) => ({
  ...(await orig<typeof import("../../../utils/scryfallSearch")>()),
  autocomplete: vi.fn(),
  searchPrintings: vi.fn(),
  fetchPrices: vi.fn(),
}));
const autocompleteMock = vi.mocked(scryfall.autocomplete);
const searchMock = vi.mocked(scryfall.searchPrintings);
const fetchPricesMock = vi.mocked(scryfall.fetchPrices);

const printing = (over: Partial<scryfall.Printing> = {}): scryfall.Printing => ({
  scryfallId: "p-bolt", name: "Lightning Bolt", set: "2xm", setName: "Double Masters", collectorNumber: "117",
  finishes: ["nonfoil", "foil"], imageUrl: "bolt.jpg", prices: { usd: "10.00", usd_foil: "20.00" }, ...over,
});

const card = (over: Partial<TradeCard> = {}): TradeCard => ({
  id: crypto.randomUUID(), name: "Sol Ring", scryfallId: "s1", set: "cmm", collectorNumber: "410",
  finish: "nonfoil", condition: "NM", quantity: 1, basePrice: 10, priceFetchedAt: Date.now() - 60_000,
  source: "search", ...over,
});
const side = (cards: TradeCard[] = [], cash: TradeSide["cash"] = []): TradeSide => ({ cards, cash });
const trade = (mine: TradeSide, theirs: TradeSide): Trade => ({ mine, theirs, settings: { ...DEFAULT_SETTINGS }, readOnly: false });

let store: Map<string, string>;
let clipboard: ReturnType<typeof vi.fn>;

function stubMatchMedia(mobile: boolean) {
  Object.defineProperty(globalThis, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("max-width: 767px") ? mobile : false,
      media: query, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    }),
  });
}

function saveLocal(t: Trade) {
  store.set(TRADE_STORAGE_KEY, JSON.stringify({ mine: t.mine, theirs: t.theirs, settings: t.settings }));
}

beforeEach(() => {
  vi.clearAllMocks();
  store = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear() },
    writable: true, configurable: true,
  });
  clipboard = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText: clipboard }, configurable: true });
  stubMatchMedia(false);
  window.location.hash = "";
  autocompleteMock.mockResolvedValue(["Lightning Bolt"]);
  searchMock.mockResolvedValue([printing()]);
  fetchPricesMock.mockResolvedValue(new Map());
});
afterEach(() => { window.location.hash = ""; });

const setup = (over: { collection?: Collection; decks?: Deck[]; onBack?: () => void } = {}) => {
  const onBack = over.onBack ?? vi.fn();
  const utils = render(<TradePage collection={over.collection ?? {}} decks={over.decks ?? []} onBack={onBack} />);
  return { onBack, ...utils };
};

const toast = () => screen.getByRole("status", { name: "Notification" });
const mineOffer = () => screen.getByRole("region", { name: "My offer" });
const theirOffer = () => screen.getByRole("region", { name: "Their offer" });

async function addBoltFromSearch(sideName: "My offer" | "Their offer") {
  const panel = within(screen.getByRole("region", { name: sideName }));
  await userEvent.click(panel.getByRole("button", { name: /Search cards/ }));
  await userEvent.type(screen.getByRole("combobox", { name: "Card name" }), "Lightning Bolt{Enter}");
  await screen.findByRole("radiogroup", { name: "Printing" });
  await userEvent.click(screen.getByRole("button", { name: "Add card" }));
}

describe("TradePage — desktop", () => {
  it("renders the three panels, breadcrumb and a neutral verdict", async () => {
    const { onBack } = setup();
    expect(screen.getByRole("heading", { level: 1, name: "Trade" })).toBeInTheDocument();
    expect(screen.getByText("Weigh a trade. Doesn't change your collection.")).toBeInTheDocument();
    expect(mineOffer()).toBeInTheDocument();
    expect(theirOffer()).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Trade controls" })).toBeInTheDocument();
    expect(screen.getByText("Add cards")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Collection" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("offers From collection on My side only", () => {
    setup();
    expect(within(mineOffer()).getByRole("button", { name: /From collection/ })).toBeInTheDocument();
    expect(within(theirOffer()).queryByRole("button", { name: /From collection/ })).not.toBeInTheDocument();
  });

  it("adds a card from Scryfall search to either side and prices it", async () => {
    setup();
    await addBoltFromSearch("Their offer");
    expect(await within(theirOffer()).findByText("Lightning Bolt")).toBeInTheDocument();
    expect(within(theirOffer()).getByTestId("subtotal-theirs")).toHaveTextContent("$9.00"); // 10 × 0.9
    expect(toast()).toHaveTextContent("Added Lightning Bolt");
  });

  it("shows a verdict once both sides have cards and points the neutral copy at the empty side", async () => {
    setup();
    await addBoltFromSearch("My offer");
    expect(screen.getByText("Add cards to Their offer to compare")).toBeInTheDocument();
    await addBoltFromSearch("Their offer");
    await waitFor(() => expect(screen.getByText("Fair")).toBeInTheDocument());
    expect(screen.getByText("Dead even")).toBeInTheDocument();
  });

  it("balances an uneven trade with one cash line on the lower side, undoably", async () => {
    saveLocal(trade(side([card({ quantity: 5 })]), side([card({ name: "Rhystic Study", set: "pcy", collectorNumber: "45" })])));
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Add cash line/ }));
    expect(within(theirOffer()).getByRole("textbox", { name: "Cash amount" })).toHaveValue("36.00");
    expect(screen.getByText("Fair")).toBeInTheDocument();
    await userEvent.click(within(toast()).getByRole("button", { name: "Undo" }));
    expect(within(theirOffer()).queryByRole("textbox", { name: "Cash amount" })).not.toBeInTheDocument();
  });

  it("adds several collection cards as one undo step and caps them at the owned quantity", async () => {
    fetchPricesMock.mockResolvedValue(new Map([
      ["cmm:410", printing({ name: "Sol Ring", set: "cmm", collectorNumber: "410", scryfallId: "sol", prices: { usd: "2.00" } })],
      ["neo:141", printing({ name: "Fable of the Mirror-Breaker", set: "neo", collectorNumber: "141", scryfallId: "fable", prices: { usd: "17.00" } })],
    ]));
    setup({ collection: { "sol ring": [{ quantity: 4, set: "cmm", collectorNumber: "410" }], "fable of the mirror-breaker": [{ quantity: 1, set: "neo", collectorNumber: "141" }] } });
    await userEvent.click(within(mineOffer()).getByRole("button", { name: /From collection/ }));
    await userEvent.click(screen.getByRole("button", { name: "Add Sol Ring" }));
    await userEvent.click(screen.getByRole("button", { name: "Add Fable of the Mirror-breaker" }));
    await userEvent.click(screen.getByRole("button", { name: "Add to My offer" }));
    expect(await within(mineOffer()).findByText("Fable of the Mirror-Breaker")).toBeInTheDocument();
    expect(within(mineOffer()).getByText("/4")).toBeInTheDocument(); // owned cap from the collection
    await userEvent.click(within(toast()).getByRole("button", { name: "Undo" }));
    expect(within(mineOffer()).queryByText("Sol Ring")).not.toBeInTheDocument();
    expect(within(mineOffer()).queryByText("Fable of the Mirror-Breaker")).not.toBeInTheDocument();
  });

  it("flags cards committed to decks without blocking them", async () => {
    saveLocal(trade(side([card({ source: "collection" })]), side()));
    setup({
      collection: { "sol ring": [{ quantity: 2, set: "cmm", collectorNumber: "410" }] },
      decks: [{ id: "d", name: "D", createdAt: 0, cards: [{ id: "1", name: "Sol Ring", quantity: 1, acquired: true, color: [], type: "" }] }] as Deck[],
    });
    expect(within(mineOffer()).getByText("1 in decks")).toBeInTheDocument();
    expect(within(mineOffer()).getByRole("button", { name: "Increase quantity of Sol Ring" })).toBeEnabled();
  });

  describe("editing tools", () => {
    beforeEach(() => saveLocal(trade(side([card({ name: "Mine A" })]), side([card({ name: "Theirs A", set: "pcy", collectorNumber: "45" })]))));

    it("clears with an Undo toast", async () => {
      setup();
      await userEvent.click(screen.getByRole("button", { name: /Clear trade/ }));
      expect(screen.queryByText("Mine A")).not.toBeInTheDocument();
      expect(toast()).toHaveTextContent("Cleared 2 cards");
      await userEvent.click(within(toast()).getByRole("button", { name: "Undo" }));
      expect(screen.getByText("Mine A")).toBeInTheDocument();
    });

    it("swaps sides", async () => {
      setup();
      await userEvent.click(screen.getByRole("button", { name: /Swap sides/ }));
      expect(within(mineOffer()).getByText("Theirs A")).toBeInTheDocument();
      expect(within(theirOffer()).getByText("Mine A")).toBeInTheDocument();
    });

    it("undoes and redoes with the keyboard, but not while typing in a field", async () => {
      setup();
      await userEvent.click(screen.getByRole("button", { name: /Clear trade/ }));
      await userEvent.keyboard("{Meta>}z{/Meta}");
      expect(screen.getByText("Mine A")).toBeInTheDocument();
      await userEvent.keyboard("{Meta>}{Shift>}z{/Shift}{/Meta}");
      expect(screen.queryByText("Mine A")).not.toBeInTheDocument();
      await userEvent.keyboard("{Meta>}z{/Meta}");
      await userEvent.click(screen.getByRole("textbox", { name: "Global discount percent" }));
      await userEvent.keyboard("{Meta>}z{/Meta}"); // in a field: native undo, not ours
      expect(screen.getByText("Mine A")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: /Clear trade/ }));
      await userEvent.click(screen.getByRole("textbox", { name: "Global discount percent" }));
      await userEvent.keyboard("{Meta>}z{/Meta}");
      expect(screen.queryByText("Mine A")).not.toBeInTheDocument();
    });

    it("removes a card with an Undo toast", async () => {
      setup();
      await userEvent.click(screen.getByRole("button", { name: "More actions for Mine A" }));
      await userEvent.click(screen.getByRole("menuitem", { name: /Remove/ }));
      expect(screen.queryByText("Mine A")).not.toBeInTheDocument();
      expect(toast()).toHaveTextContent("Removed Mine A");
    });

    it("applies a condition to a whole side from the panel menu", async () => {
      setup();
      await userEvent.click(screen.getByRole("button", { name: "My offer options" }));
      await userEvent.click(screen.getByRole("button", { name: "HP" }));
      expect(within(mineOffer()).getByRole("combobox", { name: "Condition for Mine A" })).toHaveValue("HP");
      expect(within(theirOffer()).getByRole("combobox", { name: "Condition for Theirs A" })).toHaveValue("NM");
    });

    it("persists the trade across a remount", () => {
      const { unmount } = setup();
      unmount();
      setup();
      expect(screen.getByText("Mine A")).toBeInTheDocument();
      expect(screen.getByText("Theirs A")).toBeInTheDocument();
    });
  });

  describe("prices", () => {
    it("changing finish re-fetches the price for that finish", async () => {
      saveLocal(trade(side([card({ name: "Lightning Bolt", scryfallId: "p-bolt", set: "2xm", collectorNumber: "117" })]), side()));
      fetchPricesMock.mockResolvedValue(new Map([["p-bolt", printing()]]));
      setup();
      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Finish for Lightning Bolt" }), "foil");
      await waitFor(() => expect(within(mineOffer()).getByTestId("subtotal-mine")).toHaveTextContent("$18.00")); // 20 × 0.9
    });

    it("leaves the finish alone and explains when the printing doesn't come in it", async () => {
      saveLocal(trade(side([card({ name: "Lightning Bolt", scryfallId: "p-bolt", set: "2xm", collectorNumber: "117" })]), side()));
      fetchPricesMock.mockResolvedValue(new Map([["p-bolt", printing({ finishes: ["nonfoil"] })]]));
      setup();
      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Finish for Lightning Bolt" }), "etched");
      expect(await screen.findByText(/doesn't come in etched/)).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Finish for Lightning Bolt" })).toHaveValue("nonfoil");
    });

    it("says so when the finish price can't be loaded", async () => {
      saveLocal(trade(side([card({ name: "Lightning Bolt" })]), side()));
      setup();
      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Finish for Lightning Bolt" }), "foil");
      expect(await screen.findByText(/Couldn't load the foil price/)).toBeInTheDocument();
    });

    it("refreshes prices and flags cards Scryfall didn't return", async () => {
      saveLocal(trade(
        side([card({ name: "Lightning Bolt", scryfallId: "p-bolt", set: "2xm", collectorNumber: "117", basePrice: 1 })]),
        side([card({ name: "Gone", scryfallId: "gone", set: "zzz", collectorNumber: "9" })])
      ));
      fetchPricesMock.mockResolvedValue(new Map([["p-bolt", printing()]]));
      setup();
      await userEvent.click(screen.getByRole("button", { name: /Refresh prices/ }));
      await waitFor(() => expect(within(mineOffer()).getByTestId("subtotal-mine")).toHaveTextContent("$9.00"));
      expect(within(theirOffer()).getByText("Stale")).toBeInTheDocument();
      expect(screen.getByText("1 card couldn't refresh · showing last price")).toBeInTheDocument();
    });

    it("jumps to the first unpriced row and flashes it", async () => {
      saveLocal(trade(side([card({ name: "Priced" }), card({ name: "Unpriced", basePrice: null, set: "abc", collectorNumber: "1" })]), side()));
      setup();
      await userEvent.click(screen.getByRole("button", { name: "Jump to row" }));
      const row = screen.getByText("Unpriced").closest("li")!;
      await waitFor(() => expect(row).toHaveClass("tr-row--flash"));
      expect(within(row).getByRole("button", { name: "Set price" })).toHaveFocus();
    });
  });

  describe("copy and share", () => {
    beforeEach(() => saveLocal(trade(side([card({ name: "Mine A" })]), side([card({ name: "Theirs A", set: "pcy", collectorNumber: "45" })]))));

    it("copies a plain-text summary", async () => {
      setup();
      await userEvent.click(screen.getByRole("button", { name: /Copy as text/ }));
      await waitFor(() => expect(clipboard).toHaveBeenCalled());
      expect(clipboard.mock.calls[0][0]).toContain("I give");
      expect(clipboard.mock.calls[0][0]).toContain("1x Mine A");
      expect(await screen.findByText("Trade summary copied as text")).toBeInTheDocument();
    });

    it("copies a share link built from the current origin", async () => {
      setup();
      await userEvent.click(screen.getByRole("button", { name: /Share link/ }));
      await waitFor(() => expect(clipboard).toHaveBeenCalled());
      expect(clipboard.mock.calls[0][0]).toMatch(new RegExp(`^${window.location.origin}/#trade=v1\\.`));
      expect(await screen.findByText(/Link copied/)).toBeInTheDocument();
    });

    it("falls back to text when the link would be too long", async () => {
      let seed = 7;
      const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
      const word = () => Array.from({ length: 24 }, () => String.fromCharCode(97 + (rnd() % 26))).join("");
      const many = Array.from({ length: 600 }, (_, i) => card({ name: word(), set: word().slice(0, 3), collectorNumber: String(rnd() % 9999) + i }));
      saveLocal(trade(side(many), side([card({ name: "Theirs A" })])));
      setup();
      await userEvent.click(screen.getByRole("button", { name: /Share link/ }));
      await waitFor(() => expect(clipboard).toHaveBeenCalled());
      expect(clipboard.mock.calls[0][0]).toContain("I give");
      expect(await screen.findByText(/Too many cards for a link/)).toBeInTheDocument();
    });

    it("reports a blocked clipboard instead of claiming success", async () => {
      clipboard.mockRejectedValue(new Error("denied"));
      setup();
      await userEvent.click(screen.getByRole("button", { name: /Copy as text/ }));
      expect(await screen.findByText(/clipboard access was blocked/)).toBeInTheDocument();
    });
  });
});

describe("TradePage — shared link", () => {
  // The creator's "mine" becomes the opener's "theirs".
  const shared = trade(side([card({ name: "Creator Gives" })], [{ id: "k", amount: 3 }]), side([card({ name: "Creator Gets", set: "pcy", collectorNumber: "45" })]));

  async function openShared() {
    window.location.hash = `#trade=${await encodeTrade(shared, Date.UTC(2026, 8, 26, 16, 12))}`;
    return setup();
  }

  it("opens read-only with the sides flipped, a banner, and no editing controls", async () => {
    await openShared();
    expect(await screen.findByText(/Shared trade — prices as of/)).toBeInTheDocument();
    expect(screen.getByText(/Your side is on the left/)).toBeInTheDocument();
    expect(within(mineOffer()).getByText("Creator Gets")).toBeInTheDocument();
    expect(within(theirOffer()).getByText("Creator Gives")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Search cards/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Share link/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Refresh/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copy as text/ })).toBeEnabled();
    expect(screen.getByText(/Snapshot · prices as of/)).toBeInTheDocument();
  });

  it("never overwrites the local trade", async () => {
    saveLocal(trade(side([card({ name: "Local Card" })]), side()));
    const before = store.get(TRADE_STORAGE_KEY);
    await openShared();
    await screen.findByText(/Shared trade/);
    expect(store.get(TRADE_STORAGE_KEY)).toBe(before);
  });

  it("forks straight away when there's no local trade to lose, and clears the link", async () => {
    await openShared();
    await userEvent.click(await screen.findByRole("button", { name: /Fork into my own trade/ }));
    expect(screen.queryByText(/Shared trade — prices as of/)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(mineOffer()).getByRole("button", { name: /Search cards/ })).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    await waitFor(() => expect(JSON.parse(store.get(TRADE_STORAGE_KEY)!).theirs.cards[0].name).toBe("Creator Gives"));
  });

  it("asks before replacing a local trade, with Cancel focused", async () => {
    saveLocal(trade(side([card({ name: "Local Card" })]), side()));
    await openShared();
    await userEvent.click(await screen.findByRole("button", { name: /Fork into my own trade/ }));
    const dialog = screen.getByRole("dialog", { name: "Replace your current trade?" });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/Shared trade — prices as of/)).toBeInTheDocument(); // still read-only
    expect(JSON.parse(store.get(TRADE_STORAGE_KEY)!).mine.cards[0].name).toBe("Local Card");
  });

  it("Replace forks, and Undo brings the replaced local trade back", async () => {
    saveLocal(trade(side([card({ name: "Local Card" })]), side()));
    await openShared();
    await userEvent.click(await screen.findByRole("button", { name: /Fork into my own trade/ }));
    await userEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(within(theirOffer()).getByText("Creator Gives")).toBeInTheDocument();
    expect(screen.queryByText("Local Card")).not.toBeInTheDocument();
    await userEvent.click(within(toast()).getByRole("button", { name: "Undo" }));
    expect(within(mineOffer()).getByText("Local Card")).toBeInTheDocument();
  });

  it("offers to copy the local trade as text before replacing it", async () => {
    saveLocal(trade(side([card({ name: "Local Card" })]), side()));
    await openShared();
    await userEvent.click(await screen.findByRole("button", { name: /Fork into my own trade/ }));
    await userEvent.click(screen.getByRole("button", { name: "Copy mine as text" }));
    await waitFor(() => expect(clipboard).toHaveBeenCalled());
    expect(clipboard.mock.calls[0][0]).toContain("1x Local Card");
    expect(screen.getByRole("dialog", { name: "Replace your current trade?" })).toBeInTheDocument(); // stays open
  });

  it("shows a broken-link state for a corrupt payload and lets the user start their own", async () => {
    window.location.hash = "#trade=v1.not-a-real-payload";
    setup();
    expect(await screen.findByText("This trade link is broken")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Start my own trade" }));
    expect(within(mineOffer()).getByRole("button", { name: /Search cards/ })).toBeInTheDocument();
    expect(window.location.hash).toBe("");
  });

  it("shows a reload message for a newer link format without decoding it", async () => {
    window.location.hash = "#trade=v2.whatever";
    setup();
    expect(await screen.findByText("This link needs a newer version")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });
});

describe("TradePage — mobile", () => {
  beforeEach(() => {
    stubMatchMedia(true);
    saveLocal(trade(side([card({ name: "Mine A" })]), side([card({ name: "Theirs A", set: "pcy", collectorNumber: "45" })])));
  });

  it("shows the sticky verdict bar and Mine/Theirs tabs with one panel at a time", async () => {
    setup();
    expect(screen.getByRole("button", { name: "Open trade controls" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /My offer/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Mine A")).toBeInTheDocument();
    expect(screen.queryByText("Theirs A")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Their offer/ }));
    expect(screen.getByText("Theirs A")).toBeInTheDocument();
    expect(screen.queryByText("Mine A")).not.toBeInTheDocument();
  });

  it("puts the add actions in a bottom bar, with From collection on My tab only", async () => {
    setup();
    expect(screen.getAllByRole("button", { name: /Search cards/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /From collection/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Their offer/ }));
    expect(screen.queryByRole("button", { name: /From collection/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Search cards/ })).toBeInTheDocument();
  });

  it("opens the full control panel in a sheet from the verdict bar and closes it on Escape", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Open trade controls" }));
    const sheet = screen.getByRole("dialog", { name: "Trade controls" });
    expect(within(sheet).getByRole("button", { name: /Swap sides/ })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Trade controls" })).not.toBeInTheDocument();
  });

  it("adds to whichever side's tab is open", async () => {
    setup();
    await userEvent.click(screen.getByRole("tab", { name: /Their offer/ }));
    await userEvent.click(screen.getByRole("button", { name: /Search cards/ }));
    expect(screen.getByRole("dialog", { name: "Add to Their offer" })).toBeInTheDocument();
  });

  it("jump-to-row closes the sheet and switches to the tab holding the unpriced card", async () => {
    saveLocal(trade(side([card({ name: "Mine A" })]), side([card({ name: "Theirs Unpriced", basePrice: null, set: "abc", collectorNumber: "1" })])));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Open trade controls" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Trade controls" })).getByRole("button", { name: "Jump to row" }));
    expect(screen.queryByRole("dialog", { name: "Trade controls" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Their offer/ })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(screen.getByText("Theirs Unpriced").closest("li")).toHaveClass("tr-row--flash"));
  });
});
