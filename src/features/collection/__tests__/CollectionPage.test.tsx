import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Collection, CollectionMeta, Deck } from "../../../types/index";

// react-virtuoso measures real layout, which jsdom doesn't have. Render every
// row and expose its props/handle so tests can drive scrolling.
const virtuoso = vi.hoisted(() => ({
  scrollToIndex: vi.fn(),
  props: { current: null as null | { rangeChanged?: (r: { startIndex: number }) => void } },
}));

vi.mock("react-virtuoso", async () => {
  const React = await import("react");
  return {
    Virtuoso: React.forwardRef(function FakeVirtuoso(
      props: {
        data: { name: string }[];
        itemContent: (i: number, item: unknown, ctx: unknown) => React.ReactNode;
        context: unknown;
        rangeChanged?: (r: { startIndex: number }) => void;
      },
      ref: React.Ref<unknown>,
    ) {
      virtuoso.props.current = props;
      React.useImperativeHandle(ref, () => ({ scrollToIndex: virtuoso.scrollToIndex }));
      return (
        <div data-testid="virtuoso">
          {props.data.map((d, i) => (
            <div key={d.name}>{props.itemContent(i, d, props.context)}</div>
          ))}
        </div>
      );
    }),
    GroupedVirtuoso: React.forwardRef(function FakeGroupedVirtuoso(
      props: {
        groupCounts: number[];
        groupContent: (gi: number) => React.ReactNode;
        itemContent: (i: number, gi: number, d: unknown, ctx: unknown) => React.ReactNode;
        context: unknown;
      },
      ref: React.Ref<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({ scrollToIndex: virtuoso.scrollToIndex }));
      let next = 0;
      return (
        <div data-testid="grouped-virtuoso">
          {props.groupCounts.map((count, gi) => (
            <div key={gi}>
              {props.groupContent(gi)}
              {Array.from({ length: count }, () => {
                const i = next++;
                return <div key={i}>{props.itemContent(i, gi, undefined, props.context)}</div>;
              })}
            </div>
          ))}
        </div>
      );
    }),
  };
});

import { CollectionPage } from "../CollectionPage";

const COLLECTION_KEY = "mtg-checklist-collection-v2";
const META_KEY = "mtg-checklist-collection-meta-v2";

// Node's built-in localStorage can shadow jsdom's; use an in-memory mock.
function installStorage(seed: { collection?: Collection; meta?: CollectionMeta | null } = {}) {
  const store = new Map<string, string>();
  if (seed.collection) store.set(COLLECTION_KEY, JSON.stringify(seed.collection));
  if (seed.meta) store.set(META_KEY, JSON.stringify(seed.meta));
  const mock = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  };
  for (const target of [globalThis, window]) {
    Object.defineProperty(target, "localStorage", { value: mock, writable: true, configurable: true });
  }
  return store;
}

const meta: CollectionMeta = { fileName: "mine.csv", importedAt: Date.now(), cardCount: 3 };
const base: Collection = {
  "lightning bolt": [{ quantity: 4 }],
  "counterspell": [{ quantity: 1 }, { quantity: 2, foil: true, set: "MH2" }],
  "sol ring": [{ quantity: 1 }],
};

// Only acquired deck cards count as "committed" to a deck.
const deck = (cards: { name: string; quantity: number; rarity?: "rare" | "common" }[]): Deck => ({
  id: "d1", name: "Atraxa", createdAt: 1,
  cards: cards.map((c, i) => ({
    id: `c${i}`, acquired: true, color: [], type: "x", ...c,
  })),
} as unknown as Deck);

function setup(opts: {
  collection?: Collection | null;
  decks?: Deck[];
  onOpenTrade?: () => void;
} = {}) {
  const store = installStorage(
    opts.collection === null ? {} : { collection: opts.collection ?? base, meta },
  );
  const onCollectionChange = vi.fn();
  const utils = render(
    <CollectionPage decks={opts.decks ?? []} onCollectionChange={onCollectionChange} onOpenTrade={opts.onOpenTrade} />,
  );
  return { ...utils, store, onCollectionChange };
}

const u = () => userEvent.setup({ delay: null });
const names = () =>
  [...document.querySelectorAll(".collection-card-name")].map(n => n.textContent);
const saved = (store: Map<string, string>) =>
  JSON.parse(store.get(COLLECTION_KEY) ?? "{}") as Collection;
const csvFile = (text: string, name = "new.csv") => new File([text], name, { type: "text/csv" });
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

describe("CollectionPage — rendering", () => {
  beforeEach(() => { virtuoso.scrollToIndex.mockClear(); });
  afterEach(() => { vi.useRealTimers(); });

  it("shows the empty state with no collection, and wires its actions", async () => {
    setup({ collection: null });
    expect(screen.getByText("No cards yet")).toBeInTheDocument();
    const click = vi.spyOn(fileInput(), "click");
    await u().click(screen.getByRole("button", { name: "Upload CSV" }));
    expect(click).toHaveBeenCalled();
    await u().click(screen.getByRole("button", { name: "+ Add card" }));
    expect(screen.getByPlaceholderText("Card name…")).toBeInTheDocument();
  });

  it("renders seeded rows sorted by name with the FAB visible", () => {
    setup();
    expect(names()).toEqual(["Counterspell", "Lightning Bolt", "Sol Ring"]);
    expect(screen.getByRole("button", { name: "Add card" })).toBeInTheDocument();
  });

  it("does not show the FAB or list without a collection", () => {
    setup({ collection: null });
    expect(screen.queryByRole("button", { name: "Add card" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("virtuoso")).not.toBeInTheDocument();
  });

  it("filters by search and explains an empty result; scrolls to top on change", async () => {
    setup();
    const [search] = screen.getAllByPlaceholderText(/Search/);
    await u().type(search, "zzz");
    expect(screen.getByText(/No cards/)).toHaveTextContent('matching "zzz"');
    expect(virtuoso.scrollToIndex).toHaveBeenCalledWith(0);
  });

  it("filters by pill and explains an empty pill result", async () => {
    setup();
    const desktop = document.querySelector(".collection-filter-chips--inline") as HTMLElement;
    await u().click(within(desktop).getByRole("button", { name: /In decks/ }));
    expect(screen.getByText(/No cards/)).toHaveTextContent('in "in-deck"');
    await u().click(within(desktop).getByRole("button", { name: /Foils/ }));
    expect(names()).toEqual(["Counterspell"]);
  });

  it("shows free counts and deck membership when decks are loaded", async () => {
    setup({ decks: [deck([{ name: "Lightning Bolt", quantity: 3, rarity: "rare" }])] });
    const row = screen.getByText("Lightning Bolt").closest(".collection-row") as HTMLElement;
    expect(row).toHaveTextContent("1 unassigned");
    expect(row).toHaveTextContent("1 deck");
    await u().click(within(row).getByRole("button", { name: /Lightning Bolt/ }));
    expect(row).toHaveTextContent("3 in deck");
    expect(row).toHaveTextContent("Atraxa (3)");
  });

  it("expands one row at a time", async () => {
    setup();
    const user = u();
    await user.click(screen.getByText("Sol Ring"));
    expect(screen.getByText(/PRINTINGS · 1/)).toBeInTheDocument();
    await user.click(screen.getByText("Lightning Bolt"));
    expect(screen.getAllByText(/PRINTINGS/)).toHaveLength(1);
    await user.click(screen.getByText("Lightning Bolt"));
    expect(screen.queryByText(/PRINTINGS/)).not.toBeInTheDocument();
  });
});

describe("CollectionPage — editing", () => {
  const expandRow = async (name: string) => { await u().click(screen.getByText(name)); };

  it("+ Add copy increments the generic printing and persists", async () => {
    const { store, onCollectionChange } = setup();
    await expandRow("Lightning Bolt");
    await u().click(screen.getByRole("button", { name: "+ Add copy" }));
    expect(saved(store)["lightning bolt"]).toEqual([{ quantity: 5 }]);
    expect(onCollectionChange).toHaveBeenCalledWith(expect.objectContaining({ "lightning bolt": [{ quantity: 5 }] }));
  });

  it("+ Add copy creates a generic printing when only special ones exist", async () => {
    const { store } = setup({ collection: { "sol ring": [{ quantity: 1, set: "CMR" }] } });
    await expandRow("Sol Ring");
    await u().click(screen.getByRole("button", { name: "+ Add copy" }));
    expect(saved(store)["sol ring"]).toEqual([{ quantity: 1, set: "CMR" }, { quantity: 1 }]);
  });

  it("Remove all deletes the card", async () => {
    const { store } = setup();
    await expandRow("Sol Ring");
    await u().click(screen.getByRole("button", { name: "Remove all" }));
    expect(saved(store)["sol ring"]).toBeUndefined();
    expect(names()).not.toContain("Sol Ring");
  });

  it("edits a printing's quantity, set and foil, then saves", async () => {
    const { store } = setup();
    const user = u();
    await expandRow("Lightning Bolt");
    await user.click(screen.getByRole("button", { name: /Edit 4×/ }));
    const qty = screen.getByLabelText("Quantity");
    await user.clear(qty);
    await user.type(qty, "6");
    await user.type(screen.getByPlaceholderText("Set"), "m11");
    await user.type(screen.getByPlaceholderText("#CN"), "149");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(saved(store)["lightning bolt"]).toEqual([
      { quantity: 6, set: "M11", collectorNumber: "149", foil: true },
    ]);
  });

  it("Enter saves and Escape cancels an edit", async () => {
    const { store } = setup();
    const user = u();
    await expandRow("Lightning Bolt");
    await user.click(screen.getByRole("button", { name: /Edit 4×/ }));
    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "9{Escape}");
    expect(screen.queryByLabelText("Quantity")).not.toBeInTheDocument();
    expect(saved(store)["lightning bolt"]).toEqual([{ quantity: 4 }]);

    await user.click(screen.getByRole("button", { name: /Edit 4×/ }));
    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "2{Enter}");
    expect(saved(store)["lightning bolt"]).toEqual([{ quantity: 2 }]);
  });

  it("setting a printing's quantity to 0 removes it; removing the last one removes the card", async () => {
    const { store } = setup();
    const user = u();
    await expandRow("Counterspell");
    await user.click(screen.getByRole("button", { name: /Edit 1×/ }));
    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "0{Enter}");
    expect(saved(store)["counterspell"]).toEqual([{ quantity: 2, foil: true, set: "MH2" }]);

    await user.click(screen.getByRole("button", { name: /Edit/ }));
    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "{Enter}"); // NaN → 0
    expect(saved(store)["counterspell"]).toBeUndefined();
  });

  it("+ Printing adds a new printing", async () => {
    const { store } = setup();
    const user = u();
    await expandRow("Sol Ring");
    await user.click(screen.getByRole("button", { name: "+ Printing" }));
    await user.type(screen.getByPlaceholderText("Set"), "cmr");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(saved(store)["sol ring"]).toEqual([{ quantity: 1 }, { quantity: 1, set: "CMR" }]);
  });
});

describe("CollectionPage — quick add", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ data: [] }) }))); });
  afterEach(() => { vi.unstubAllGlobals(); });

  const add = async (name: string, opts: { foil?: boolean; more?: number } = {}) => {
    const user = u();
    await user.type(screen.getByPlaceholderText("Card name…"), name);
    for (let i = 0; i < (opts.more ?? 0); i++) {
      await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    }
    if (opts.foil) await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Add" }));
  };

  it("adds a new card and merges into an existing generic printing", async () => {
    const { store, onCollectionChange } = setup();
    await u().click(screen.getByRole("button", { name: "Add card" }));
    await add("Black Lotus", { more: 1 });
    expect(saved(store)["black lotus"]).toEqual([{ quantity: 2 }]);
    await add("Sol Ring");
    expect(saved(store)["sol ring"]).toEqual([{ quantity: 2 }]);
    expect(onCollectionChange).toHaveBeenCalledTimes(2);
    expect(JSON.parse(store.get(META_KEY)!).cardCount).toBe(4);
  });

  it("keeps foil and non-foil copies separate", async () => {
    const { store } = setup();
    await u().click(screen.getByRole("button", { name: "Add card" }));
    await add("Sol Ring", { foil: true });
    expect(saved(store)["sol ring"]).toEqual([{ quantity: 1 }, { quantity: 1, foil: true }]);
  });

  it("creates 'Manual entries' metadata when there was no collection", async () => {
    const { store } = setup({ collection: null });
    await u().click(screen.getByRole("button", { name: "+ Add card" }));
    await add("Sol Ring");
    expect(JSON.parse(store.get(META_KEY)!).fileName).toBe("Manual entries");
    expect(names()).toEqual(["Sol Ring"]);
  });

  it("the header + Add button toggles the form; Cancel closes it", async () => {
    setup();
    const user = u();
    await user.click(screen.getByRole("button", { name: "+ Add" }));
    expect(screen.getByPlaceholderText("Card name…")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "+ Add" }));
    expect(screen.queryByPlaceholderText("Card name…")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "+ Add" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByPlaceholderText("Card name…")).not.toBeInTheDocument();
  });
});

describe("CollectionPage — CSV import", () => {
  it("imports straight away when there is no existing collection", async () => {
    const { store, onCollectionChange } = setup({ collection: null });
    fireEvent.change(fileInput(), { target: { files: [csvFile("name,count\nSol Ring,2\nCounterspell,1")] } });
    await waitFor(() => expect(names()).toEqual(["Counterspell", "Sol Ring"]));
    expect(JSON.parse(store.get(META_KEY)!)).toMatchObject({ fileName: "new.csv", cardCount: 2 });
    expect(onCollectionChange).toHaveBeenCalled();
  });

  it("shows an error for an unreadable CSV", async () => {
    setup({ collection: null });
    fireEvent.change(fileInput(), { target: { files: [csvFile("nonsense")] } });
    await waitFor(() => expect(document.querySelector(".import-error")).toBeInTheDocument());
    expect(screen.queryByText("No cards yet")).not.toBeInTheDocument();
  });

  it("ignores an empty file selection", () => {
    const { onCollectionChange } = setup({ collection: null });
    fireEvent.change(fileInput(), { target: { files: [] } });
    expect(onCollectionChange).not.toHaveBeenCalled();
  });

  it("asks before replacing an existing collection; Cancel keeps it", async () => {
    const { onCollectionChange } = setup();
    fireEvent.change(fileInput(), { target: { files: [csvFile("name,count\nBlack Lotus,1")] } });
    expect(document.querySelector(".collection-confirm-banner")).toHaveTextContent("3 cards");
    expect(screen.getByText("new.csv")).toBeInTheDocument();
    await u().click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("new.csv")).not.toBeInTheDocument();
    expect(onCollectionChange).not.toHaveBeenCalled();
  });

  it("Replace imports the pending file", async () => {
    setup();
    fireEvent.change(fileInput(), { target: { files: [csvFile("name,count\nBlack Lotus,1")] } });
    await u().click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(names()).toEqual(["Black Lotus"]));
  });
});

describe("CollectionPage — bulk edit and undo", () => {
  afterEach(() => { vi.useRealTimers(); });

  const openBulk = async () => {
    const user = u();
    await user.click(screen.getAllByRole("button", { name: "More options" })[0]);
    await user.click(screen.getByText("Bulk edit"));
  };

  it("merges pasted cards without an undo toast", async () => {
    const { store } = setup();
    const user = u();
    await openBulk();
    fireEvent.change(screen.getByPlaceholderText(/Lightning Bolt/), { target: { value: "1 Black Lotus" } });
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(saved(store)["black lotus"]).toEqual([{ quantity: 1 }]);
    expect(saved(store)["sol ring"]).toBeDefined();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("Bulk edit")).not.toBeInTheDocument(); // panel closed
  });

  it("replace-all shows an undo toast and Undo restores the previous collection", async () => {
    const { store, onCollectionChange } = setup();
    const user = u();
    await openBulk();
    await user.click(screen.getByText("Replace all"));
    fireEvent.change(screen.getByPlaceholderText(/Lightning Bolt/), { target: { value: "1 Black Lotus" } });
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByRole("status")).toHaveTextContent("Collection replaced.");
    expect(Object.keys(saved(store))).toEqual(["black lotus"]);

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(Object.keys(saved(store)).sort()).toEqual(["counterspell", "lightning bolt", "sol ring"]);
    expect(onCollectionChange).toHaveBeenLastCalledWith(expect.objectContaining({ "sol ring": expect.anything() }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("clearing the collection offers undo and returns to the empty state", async () => {
    const { store } = setup();
    const user = u();
    await openBulk();
    await user.click(screen.getByRole("button", { name: "Clear entire collection" }));
    await user.click(screen.getByRole("button", { name: "Yes, clear" }));
    expect(screen.getByRole("status")).toHaveTextContent("Collection cleared.");
    expect(screen.getByText("No cards yet")).toBeInTheDocument();
    expect(saved(store)).toEqual({});

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(names()).toEqual(["Counterspell", "Lightning Bolt", "Sol Ring"]);
  });

  it("the undo toast expires after 30 seconds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    setup();
    fireEvent.click(screen.getAllByRole("button", { name: "More options" })[0]);
    fireEvent.click(screen.getByText("Bulk edit"));
    fireEvent.click(screen.getByRole("button", { name: "Clear entire collection" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, clear" }));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("closing the panel discards typed text", async () => {
    setup();
    const user = u();
    await openBulk();
    fireEvent.change(screen.getByPlaceholderText(/Lightning Bolt/), { target: { value: "1 Black Lotus" } });
    await user.click(screen.getByRole("button", { name: "Close bulk edit" }));
    await openBulk();
    expect(screen.getByPlaceholderText(/Lightning Bolt/)).toHaveValue("");
  });
});

describe("CollectionPage — overflow, trade and alpha rail", () => {
  beforeEach(() => { virtuoso.scrollToIndex.mockClear(); });

  it("mobile overflow sheet opens the bulk edit panel", async () => {
    setup();
    const user = u();
    await user.click(screen.getAllByRole("button", { name: "More options" })[1]);
    await user.click(await screen.findByText("Bulk edit"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument());
  });

  it("mobile overflow sheet passes Trade calculator through", async () => {
    const onOpenTrade = vi.fn();
    setup({ onOpenTrade });
    await u().click(screen.getAllByRole("button", { name: "More options" })[1]);
    await u().click(await screen.findByText(/Trade calculator/));
    await waitFor(() => expect(onOpenTrade).toHaveBeenCalled());
  });

  it("mobile overflow Upload/Replace CSV triggers the file picker", async () => {
    setup();
    const click = vi.spyOn(fileInput(), "click");
    await u().click(screen.getAllByRole("button", { name: "More options" })[1]);
    await u().click(await screen.findByText("Replace CSV"));
    expect(click).toHaveBeenCalled();
  });

  it("desktop overflow Trade calculator calls onOpenTrade", async () => {
    const onOpenTrade = vi.fn();
    setup({ onOpenTrade });
    const user = u();
    await user.click(screen.getAllByRole("button", { name: "More options" })[0]);
    await user.click(screen.getByText(/Trade calculator/));
    expect(onOpenTrade).toHaveBeenCalled();
  });

  const bigCollection = (): Collection =>
    Object.fromEntries("abcdefghijkl".split("").map((l, i) => [`${l} card`, [{ quantity: i + 1 }]]));

  it("shows the alpha rail for long, name-sorted lists and jumps to a letter", () => {
    setup({ collection: bigCollection() });
    const rail = document.querySelector(".alpha-rail") as HTMLElement;
    expect(rail).toBeInTheDocument();
    rail.getBoundingClientRect = () => ({ top: 0, height: 260 }) as DOMRect;
    fireEvent.pointerDown(rail, { clientY: 25, buttons: 1 }); // letter C → index 2
    expect(virtuoso.scrollToIndex).toHaveBeenCalledWith({ index: 2, behavior: "auto" });
    virtuoso.scrollToIndex.mockClear();
    fireEvent.pointerDown(rail, { clientY: 255, buttons: 1 }); // Z has no entries
    expect(virtuoso.scrollToIndex).not.toHaveBeenCalled();
  });

  it("highlights the letter of the first visible row", () => {
    setup({ collection: bigCollection() });
    act(() => { virtuoso.props.current!.rangeChanged!({ startIndex: 4 }); });
    expect(screen.getByText("E", { selector: ".alpha-rail-item" })).toHaveClass("active");
  });

  it("hides the rail for short lists and for quantity sorts", async () => {
    const { unmount } = setup();
    expect(document.querySelector(".alpha-rail")).toBeNull();
    unmount();

    setup({ collection: bigCollection() });
    const user = u();
    await user.click(screen.getByTitle("Name A→Z"));
    await user.click(screen.getAllByText("Qty ↓")[0]);
    expect(document.querySelector(".alpha-rail")).toBeNull();
    expect(names()[0]).toBe("L Card");
  });
});

describe("CollectionPage — group by set", () => {
  const setCollection = (): Collection => ({
    "sol ring": [{ quantity: 1, set: "c21", collectorNumber: "5" }, { quantity: 2, set: "cmm", collectorNumber: "9" }],
    "counterspell": [{ quantity: 1, set: "cmm", collectorNumber: "3", foil: true }],
    "island": [{ quantity: 3 }],
  });
  const groupBySet = async () => {
    await u().click(screen.getByTitle("Name A→Z"));
    await u().click(screen.getAllByText("Group by set")[0]);
  };
  const header = (code: string) => screen.getByRole("button", { name: new RegExp(`^${code}`) });

  it("groups printings under set headers with counts, Unknown last, and no alpha rail", async () => {
    setup({ collection: { ...setCollection(), ...Object.fromEntries("abcdefghijkl".split("").map(l => [`${l} card`, [{ quantity: 1, set: "zzz" }]])) } });
    await groupBySet();
    const headers = screen.getAllByRole("button", { expanded: true }).filter(b => b.classList.contains("collection-set-header"));
    expect(headers.map(h => h.querySelector(".collection-set-code")!.textContent)).toEqual(["C21", "CMM", "ZZZ", "Unknown set"]);
    expect(header("CMM")).toHaveTextContent("2 cards (3 copies)");
    expect(document.querySelector(".alpha-rail")).toBeNull();
  });

  it("toggles a group with aria-expanded and keeps its counts", async () => {
    setup({ collection: setCollection() });
    await groupBySet();
    expect(screen.getAllByText("Counterspell")).toHaveLength(1);
    await u().click(header("CMM"));
    expect(header("CMM")).toHaveAttribute("aria-expanded", "false");
    expect(header("CMM")).toHaveTextContent("2 cards (3 copies)");
    expect(screen.queryByText("Counterspell")).toBeNull();
  });

  it("Collapse all / Expand all toggles every group", async () => {
    setup({ collection: setCollection() });
    await groupBySet();
    await u().click(screen.getAllByRole("button", { name: "Collapse all" })[0]);
    expect(document.querySelectorAll('.collection-set-header[aria-expanded="false"]')).toHaveLength(3);
    await u().click(screen.getAllByRole("button", { name: "Expand all" })[0]);
    expect(document.querySelectorAll('.collection-set-header[aria-expanded="false"]')).toHaveLength(0);
  });

  it("an active search forces groups open and the collapsed state returns when cleared", async () => {
    setup({ collection: setCollection() });
    await groupBySet();
    await u().click(header("CMM"));
    const search = screen.getAllByPlaceholderText(/Search/)[0];
    await u().type(search, "counter");
    expect(header("CMM")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Counterspell")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Collapse all" })).toBeNull();
    await u().clear(search);
    expect(header("CMM")).toHaveAttribute("aria-expanded", "false");
  });

  it("switching sort clears collapse state", async () => {
    setup({ collection: setCollection() });
    await groupBySet();
    await u().click(header("CMM"));
    await u().click(screen.getByTitle("Group by set"));
    await u().click(screen.getAllByText("Name A→Z")[0]);
    await groupBySet();
    expect(header("CMM")).toHaveAttribute("aria-expanded", "true");
  });

  it("Remove all in a group only removes that set's printings", async () => {
    const store = installStorage({ collection: setCollection(), meta });
    render(<CollectionPage decks={[]} onCollectionChange={vi.fn()} />);
    await groupBySet();
    const rows = [...document.querySelectorAll('[data-collection-key="sol ring"]')];
    expect(rows).toHaveLength(2); // one per set
    await u().click(within(rows[1] as HTMLElement).getByRole("button", { expanded: false }));
    await u().click(within(rows[1] as HTMLElement).getByRole("button", { name: "Remove all" }));
    const saved = JSON.parse(store.get(COLLECTION_KEY)!);
    expect(saved["sol ring"]).toEqual([{ quantity: 1, set: "c21", collectorNumber: "5" }]);
  });
});
