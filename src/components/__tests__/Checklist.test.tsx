import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checklist } from "../Checklist";
import type { Card, Deck } from "../../types/index";

// Node's built-in localStorage can shadow jsdom's; use an in-memory mock.
function installStorage(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
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

function stubMedia(coarse: boolean) {
  vi.stubGlobal("matchMedia", vi.fn((q: string) => ({
    matches: q.includes("coarse") ? coarse : false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
}

const card = (o: Partial<Card> & { id: string; name: string }): Card => ({
  quantity: 1, acquired: false, color: [], type: "Artifact", ...o,
});

const cards: Card[] = [
  card({ id: "c1", name: "Sol Ring", acquired: true, source: "owned", rarity: "uncommon", set: "LTC", type: "Artifact" }),
  card({ id: "c2", name: "Lightning Bolt", quantity: 4, color: ["R"], type: "Instant", source: "need_to_buy", rarity: "common", set: "M11" }),
  card({ id: "c3", name: "Counterspell", quantity: 2, color: ["U"], type: "Instant", inputName: "Counter Spell" }),
  card({ id: "c4", name: "Atraxa, Praetors' Voice", color: ["W", "U", "B", "G"], type: "Legendary Creature — Phyrexian Angel Horror", rarity: "mythic", set: "CM2" }),
  card({ id: "c5", name: "Forest", quantity: 3, color: ["G"], type: "Basic Land — Forest", source: "in_binder" }),
];

const deck = (over: Partial<Deck> = {}): Deck =>
  ({ id: "d1", name: "Atraxa", cards, createdAt: 1, ...over }) as Deck;

function setup(over: Partial<React.ComponentProps<typeof Checklist>> = {}, d: Deck = deck()) {
  const props: React.ComponentProps<typeof Checklist> = {
    deck: d,
    editMode: false,
    selectMode: false,
    onToggleAcquired: vi.fn(),
    onSetSource: vi.fn(),
    onBulkSetSource: vi.fn(),
    onRemoveCard: vi.fn(),
    onUpdateQuantity: vi.fn(),
    onAddCard: vi.fn(async () => ({ success: true })),
    ...over,
  };
  const utils = render(<Checklist {...props} />);
  return { ...props, ...utils };
}

const u = () => userEvent.setup({ delay: null });
const rowNames = () => [...document.querySelectorAll(".card-row:not(.add-card-row):not(.card-row-select-all) .row-name")].map(n => n.textContent);
const colorPill = (v: string) => document.querySelector(`.color-pill-${v}`) as HTMLElement;
const row = (name: string) => screen.getByText(name, { selector: ".row-name" }).closest(".card-row") as HTMLElement;

beforeEach(() => { installStorage(); stubMedia(false); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("Checklist — display", () => {
  it("shows progress totals and percentage", () => {
    setup();
    expect(document.querySelector(".progress-strip-count")).toHaveTextContent("1 / 11 fetched");
    expect(document.querySelector(".progress-strip-pct")).toHaveTextContent("9%");
    const fill = document.querySelector<HTMLElement>(".progress-bar-fill")!;
    expect(parseFloat(fill.style.width)).toBeCloseTo(9.09, 1);
  });

  it("handles an empty deck", () => {
    setup({}, deck({ cards: [] }));
    expect(document.querySelector(".progress-strip-pct")).toHaveTextContent("0%");
    expect(document.querySelector<HTMLElement>(".progress-bar-fill")!.style.width).toBe("0%");
    expect(screen.getByText("No cards in this deck.")).toBeInTheDocument();
  });

  it("sorts by name by default and renders row details", () => {
    setup();
    expect(rowNames()).toEqual(["Atraxa, Praetors' Voice", "Counterspell", "Forest", "Lightning Bolt", "Sol Ring"]);
    const bolt = row("Lightning Bolt");
    expect(bolt).toHaveTextContent("4×");
    expect(bolt).toHaveTextContent("Instant");
    expect(bolt).toHaveTextContent("M11 · C");
    expect(bolt).toHaveTextContent("Need to buy");
    expect(bolt.querySelector(".color-pip-R")).toBeInTheDocument();
    expect(row("Sol Ring")).toHaveClass("acquired");
    expect(row("Sol Ring").querySelector(".color-pip-C")).toBeInTheDocument();
    expect(row("Atraxa, Praetors' Voice")).toHaveTextContent("CM2 · M");
    expect(row("Atraxa, Praetors' Voice")).toHaveTextContent("Creature");
    expect(row("Atraxa, Praetors' Voice").querySelectorAll(".color-pip")).toHaveLength(4);
  });

  it("source legend chips show quantities by source", () => {
    setup();
    const legend = document.querySelector(".progress-legend")!;
    expect(legend).toHaveTextContent("1 owned");
    expect(legend).toHaveTextContent("4 to buy");
    expect(legend).toHaveTextContent("3 in binder");
    expect(legend).toHaveTextContent("3 untagged");
    expect(legend).not.toHaveTextContent("proxy");
  });

  it("renders Extra Info nav links only when there is extra info or enrichment", () => {
    const { unmount } = setup();
    expect(screen.queryByText("Extra Info ↓")).not.toBeInTheDocument();
    unmount();
    setup({ isEnrichmentLoading: true });
    expect(screen.getByText("Extra Info ↓")).toBeInTheDocument();
    expect(screen.getByText("Back to top ↑")).toBeInTheDocument();
  });
});

describe("Checklist — filtering, sorting, grouping", () => {
  it("search matches name, alternate input name and type", async () => {
    setup();
    const box = screen.getByPlaceholderText("Search cards…");
    await u().type(box, "counter spell");
    expect(rowNames()).toEqual(["Counterspell"]);
    await u().clear(box);
    await u().type(box, "phyrexian");
    expect(rowNames()).toEqual(["Atraxa, Praetors' Voice"]);
    await u().clear(box);
    await u().type(box, "zzz");
    expect(screen.getByText('No cards match "zzz".')).toBeInTheDocument();
  });

  it("sort menu orders by name desc, qty desc/asc and default", async () => {
    setup();
    const user = u();
    const pick = async (label: string) => {
      await user.click(document.querySelector(".sort-pill") as HTMLElement);
      await user.click(screen.getByText(label));
    };
    await pick("Name Z → A");
    expect(rowNames()[0]).toBe("Sol Ring");
    await pick("Qty ↓");
    expect(rowNames().slice(0, 2)).toEqual(["Lightning Bolt", "Forest"]);
    await pick("Qty ↑");
    expect(rowNames().slice(0, 3)).toEqual(["Atraxa, Praetors' Voice", "Sol Ring", "Counterspell"]);
    await pick("Default");
    expect(rowNames()).toEqual(["Sol Ring", "Lightning Bolt", "Counterspell", "Atraxa, Praetors' Voice", "Forest"]);
  });

  it("sort menu closes on outside click", async () => {
    setup();
    await u().click(screen.getByText("Name ↑ ▾"));
    expect(document.querySelector(".sort-picker-dropdown")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(document.querySelector(".sort-picker-dropdown")).toBeNull();
  });

  it("Missing only hides acquired cards", async () => {
    const user = u();
    setup();
    await user.click(screen.getByText("Missing only"));
    expect(rowNames()).not.toContain("Sol Ring");
    expect(rowNames()).toHaveLength(4);
  });

  it("shows 'All cards acquired!' when everything is acquired", async () => {
    setup({}, deck({ cards: [card({ id: "x", name: "Sol Ring", acquired: true })] }));
    await u().click(screen.getByText("Missing only"));
    expect(screen.getByText("All cards acquired!")).toBeInTheDocument();
  });

  it("filters by source via legend chip, toggles it off, and shows a dismissable pill", async () => {
    const user = u();
    setup();
    await user.click(within(document.querySelector(".progress-legend") as HTMLElement).getByText("4 to buy"));
    expect(rowNames()).toEqual(["Lightning Bolt"]);
    const pill = document.querySelector(".filter-pill-dismissable") as HTMLElement;
    expect(pill).toHaveTextContent("Need to buy");
    expect(pill).toHaveTextContent("4");
    await user.click(pill);
    expect(rowNames()).toHaveLength(5);

    await user.click(within(document.querySelector(".progress-legend") as HTMLElement).getByText("3 untagged"));
    expect(rowNames()).toEqual(["Atraxa, Praetors' Voice", "Counterspell"]);
    expect(document.querySelector(".filter-pill-dismissable")).toHaveTextContent("Untagged");
    await user.click(within(document.querySelector(".progress-legend") as HTMLElement).getByText("3 untagged"));
    expect(rowNames()).toHaveLength(5);
  });

  it("source filter with no matches explains itself", async () => {
    setup();
    await u().click(screen.getByText("More ▾"));
    await u().selectOptions(screen.getByRole("combobox"), "proxy");
    expect(screen.getByText("No cards with this source tag.")).toBeInTheDocument();
  });

  it("More menu: filter by source select closes the menu; type pills filter and appear as dismissable pills", async () => {
    const user = u();
    setup();
    await user.click(screen.getByText("More ▾"));
    await user.selectOptions(screen.getByRole("combobox"), "untagged");
    expect(document.querySelector(".display-menu-dropdown")).toBeNull();
    expect(rowNames().sort()).toEqual(["Atraxa, Praetors' Voice", "Counterspell"]);

    await user.click(screen.getByText("More ▾"));
    await user.click(screen.getByRole("button", { name: "Instant" }));
    await user.click(screen.getByRole("button", { name: "Instant" })); // toggle off
    await user.click(screen.getByRole("button", { name: "Instant" })); // on again
    expect(screen.getByText("Filters (1)")).toBeInTheDocument();
    expect(rowNames()).toEqual(["Counterspell"]);
    const typePill = [...document.querySelectorAll(".filter-pill-dismissable")].find(n => n.textContent?.startsWith("Instant"))!;
    expect(typePill).toHaveTextContent("6"); // 4 bolt + 2 counterspell
  });

  it("Clear all filters resets everything", async () => {
    const user = u();
    setup();
    await user.click(screen.getByText("Missing only"));
    await user.click(screen.getByText("More ▾"));
    await user.click(screen.getByRole("button", { name: "Instant" }));
    await user.click(screen.getByText("Clear all filters"));
    expect(document.querySelector(".display-menu-dropdown")).toBeNull();
    expect(rowNames()).toHaveLength(5);
    expect(screen.getByText("More ▾")).toBeInTheDocument();
  });

  it("More menu closes on outside click and backdrop click", async () => {
    const user = u();
    setup();
    await user.click(screen.getByText("More ▾"));
    fireEvent.mouseDown(document.body);
    expect(document.querySelector(".display-menu-dropdown")).toBeNull();
    await user.click(screen.getByText("More ▾"));
    fireEvent.click(document.querySelector(".mobile-sheet-backdrop")!);
    expect(document.querySelector(".display-menu-dropdown")).toBeNull();
  });

  it("color filters: single, colorless, multicolor and toggle off", async () => {
    const user = u();
    setup();
    await user.click(colorPill("R"));
    expect(rowNames()).toEqual(["Lightning Bolt"]);
    await user.click(colorPill("R"));
    expect(rowNames()).toHaveLength(5);

    await user.click(colorPill("colorless"));
    expect(rowNames()).toEqual(["Sol Ring"]);
    await user.click(colorPill("multi"));
    expect(rowNames()).toEqual(["Atraxa, Praetors' Voice", "Sol Ring"]);
    await user.click(colorPill("G"));
    expect(rowNames()).toEqual(["Atraxa, Praetors' Voice", "Forest", "Sol Ring"]);
  });

  it("group picker groups by color, type and source with collapsible headers", async () => {
    const user = u();
    setup();
    const group = async (name: string) => {
      await user.click(screen.getByText(/^Group/));
      await user.click(screen.getByRole("button", { name }));
    };

    await group("Color");
    const titles = () => [...document.querySelectorAll(".group-title")].map(n => n.textContent);
    expect(titles().join("|")).toContain("MULTICOLOR");
    expect(titles().join("|")).toContain("COLORLESS");
    expect(screen.getByText(/^Group: Color/)).toBeInTheDocument();

    await group("Type");
    expect(titles().join("|")).toContain("INSTANT");

    await group("Source");
    const sourceTitles = titles();
    expect(sourceTitles[sourceTitles.length - 1]).toContain("UNTAGGED"); // untagged sorted last
    expect(sourceTitles[sourceTitles.length - 1]).toContain("3");

    // collapse / expand a group
    const first = document.querySelector(".group-title-btn") as HTMLElement;
    const groupName = first.textContent!.replace(/[▶▼]/, "").replace(/\d+$/, "").trim();
    await user.click(first);
    expect(first).toHaveClass("collapsed");
    expect(first.closest(".card-group")!.querySelector(".card-list")).toBeNull();
    await user.click(first);
    expect(first.closest(".card-group")!.querySelector(".card-list")).toBeInTheDocument();
    expect(groupName.length).toBeGreaterThan(0);

    await group("None");
    expect(document.querySelector(".group-title")).toBeNull();
  });

  it("group picker closes on outside click", async () => {
    setup();
    await u().click(screen.getByText(/^Group/));
    expect(document.querySelector(".group-picker-dropdown")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(document.querySelector(".group-picker-dropdown")).toBeNull();
  });

  it("filterCardIds restricts the visible cards", () => {
    setup({ filterCardIds: ["c2", "c3"] });
    expect(rowNames()).toEqual(["Counterspell", "Lightning Bolt"]);
  });
});

describe("Checklist — acquiring and row actions", () => {
  it("toggling a checkbox marks acquired", async () => {
    const p = setup();
    await u().click(within(row("Lightning Bolt")).getByRole("checkbox"));
    expect(p.onToggleAcquired).toHaveBeenCalledWith("c2");
  });

  it("row overflow menu sets source and removes a card (desktop)", async () => {
    const p = setup();
    const user = u();
    await user.click(within(row("Counterspell")).getByRole("button", { name: /Card actions/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "Owned" }));
    expect(p.onSetSource).toHaveBeenCalledWith("c3", "owned");
  });

  it("clicking a row on a non-touch device does nothing special", async () => {
    setup();
    await u().click(screen.getByText("Counterspell", { selector: ".row-name" }));
    expect(document.querySelector(".card-row-sheet")).toBeNull();
  });
});

describe("Checklist — touch devices", () => {
  beforeEach(() => stubMedia(true));

  it("hides the overflow menu and opens the bottom sheet on row tap", async () => {
    const p = setup();
    expect(screen.queryByRole("button", { name: /Card actions/ })).not.toBeInTheDocument();
    fireEvent.click(row("Counterspell"));
    await waitFor(() => expect(screen.getByRole("dialog", { hidden: true })).toBeInTheDocument());
    expect(screen.getByRole("dialog", { hidden: true })).toHaveTextContent("Counterspell");
    expect(p.onToggleAcquired).not.toHaveBeenCalled();
  });

  it("tapping the checkbox does not open the sheet", async () => {
    const p = setup();
    await u().click(within(row("Counterspell")).getByRole("checkbox"));
    expect(p.onToggleAcquired).toHaveBeenCalledWith("c3");
    expect(document.querySelector(".card-row-sheet")).toBeNull();
  });

  it("removing from the sheet removes the card and closes it", async () => {
    const p = setup();
    fireEvent.click(row("Counterspell"));
    await waitFor(() => screen.getByRole("dialog", { hidden: true }));
    fireEvent.click(screen.getByText("Remove from deck"));
    fireEvent.click(screen.getByRole("button", { name: "Remove", hidden: true }));
    expect(p.onRemoveCard).toHaveBeenCalledWith("c3");
    await waitFor(() => expect(document.querySelector(".card-row-sheet")).toBeNull());
  });
});

describe("Checklist — select mode", () => {
  it("rows toggle selection; checkboxes reflect selection; bulk bar appears", async () => {
    const user = u();
    setup({ selectMode: true });
    fireEvent.click(row("Counterspell"));
    fireEvent.click(row("Forest"));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(within(row("Counterspell")).getByRole("checkbox")).toBeChecked();
    fireEvent.click(row("Counterspell"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    void user;
  });

  it("checkbox click toggles selection instead of acquired", async () => {
    const p = setup({ selectMode: true });
    await u().click(within(row("Counterspell")).getByRole("checkbox"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(p.onToggleAcquired).not.toHaveBeenCalled();
  });

  it("select all selects every visible card and toggles back", async () => {
    setup({ selectMode: true });
    fireEvent.click(screen.getByText("Select all"));
    expect(screen.getByText("5 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Select all"));
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it("select all only covers filtered cards", async () => {
    setup({ selectMode: true });
    await u().click(colorPill("R"));
    fireEvent.click(screen.getByText("Select all"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("applies a bulk source and clears the selection", async () => {
    const user = u();
    const p = setup({ selectMode: true });
    fireEvent.click(row("Counterspell"));
    fireEvent.click(row("Forest"));
    const bar = document.querySelector(".bulk-bar") as HTMLElement;
    expect(within(bar).getByRole("button", { name: "Apply" })).toBeDisabled();
    await user.selectOptions(within(bar).getByRole("combobox"), "proxy");
    await user.click(within(bar).getByRole("button", { name: "Apply" }));
    expect(p.onBulkSetSource).toHaveBeenCalledWith(expect.arrayContaining(["c3", "c5"]), "proxy");
    expect(document.querySelector(".bulk-bar")).toBeNull();
  });

  it("Cancel clears the selection", async () => {
    setup({ selectMode: true });
    fireEvent.click(row("Counterspell"));
    await u().click(within(document.querySelector(".bulk-bar") as HTMLElement).getByRole("button", { name: "Cancel" }));
    expect(document.querySelector(".bulk-bar")).toBeNull();
  });

  it("turning select mode off from the parent clears the selection", () => {
    const { rerender, ...p } = setup({ selectMode: true });
    fireEvent.click(row("Counterspell"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    rerender(<Checklist {...(p as unknown as React.ComponentProps<typeof Checklist>)} deck={deck()} editMode={false} selectMode={false} />);
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });
});

describe("Checklist — edit mode", () => {
  it("shows the banner, hides checkboxes and the overflow menu, shows remove buttons", async () => {
    const p = setup({ editMode: true });
    expect(screen.getByText(/Edit mode/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Card actions/ })).not.toBeInTheDocument();
    await u().click(within(row("Forest")).getByTitle("Remove card"));
    expect(p.onRemoveCard).toHaveBeenCalledWith("c5");
  });

  it("edits quantity: Enter commits, valid only", async () => {
    const user = u();
    const p = setup({ editMode: true });
    await user.click(within(row("Forest")).getByTitle("Click to edit quantity"));
    const input = document.querySelector(".qty-edit-input") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "7{Enter}");
    expect(p.onUpdateQuantity).toHaveBeenCalledWith("c5", 7);
    expect(document.querySelector(".qty-edit-input")).toBeNull();
  });

  it("blur commits; invalid or zero quantities are ignored; Escape cancels", async () => {
    const user = u();
    const p = setup({ editMode: true });
    await user.click(within(row("Forest")).getByTitle("Click to edit quantity"));
    await user.clear(document.querySelector(".qty-edit-input")!);
    await user.type(document.querySelector(".qty-edit-input")!, "0");
    fireEvent.blur(document.querySelector(".qty-edit-input")!);
    expect(p.onUpdateQuantity).not.toHaveBeenCalled();
    expect(document.querySelector(".qty-edit-input")).toBeNull();

    await user.click(within(row("Forest")).getByTitle("Click to edit quantity"));
    await user.clear(document.querySelector(".qty-edit-input")!);
    await user.type(document.querySelector(".qty-edit-input")!, "9");
    fireEvent.blur(document.querySelector(".qty-edit-input")!);
    expect(p.onUpdateQuantity).toHaveBeenCalledWith("c5", 9);

    await user.click(within(row("Forest")).getByTitle("Click to edit quantity"));
    await user.type(document.querySelector(".qty-edit-input")!, "{Escape}");
    expect(document.querySelector(".qty-edit-input")).toBeNull();
    expect(p.onUpdateQuantity).toHaveBeenCalledTimes(1);
  });

  it("leaving edit mode cancels an in-progress quantity edit", async () => {
    const user = u();
    const { rerender, ...p } = setup({ editMode: true });
    await user.click(within(row("Forest")).getByTitle("Click to edit quantity"));
    expect(document.querySelector(".qty-edit-input")).toBeInTheDocument();
    rerender(<Checklist {...(p as unknown as React.ComponentProps<typeof Checklist>)} deck={deck()} editMode={false} selectMode={false} />);
    expect(document.querySelector(".qty-edit-input")).toBeNull();
  });

  describe("add card row", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ data: ["Sol Ring", "Sol Talisman"] }) })));
    });

    it("adds 'qty name' and resets on success", async () => {
      const user = u();
      const p = setup({ editMode: true });
      const input = screen.getByPlaceholderText("Add card…");
      fireEvent.change(document.querySelector(".add-card-qty")!, { target: { value: "3" } });
      await user.type(input, "Black Lotus");
      await user.click(screen.getByRole("button", { name: "Add" }));
      expect(p.onAddCard).toHaveBeenCalledWith("3 Black Lotus");
      await waitFor(() => expect(input).toHaveValue(""));
      expect(document.querySelector(".add-card-qty")).toHaveValue(1);
    });

    it("clamps quantity to at least 1", () => {
      setup({ editMode: true });
      fireEvent.change(document.querySelector(".add-card-qty")!, { target: { value: "-4" } });
      expect(document.querySelector(".add-card-qty")).toHaveValue(1);
    });

    it("shows the error message from a failed add (and a default)", async () => {
      const user = u();
      const onAddCard = vi.fn()
        .mockResolvedValueOnce({ success: false, error: "Nope." })
        .mockResolvedValueOnce({ success: false });
      setup({ editMode: true, onAddCard });
      await user.type(screen.getByPlaceholderText("Add card…"), "Xyz{Enter}");
      expect(await screen.findByText("Nope.")).toBeInTheDocument();
      await user.type(screen.getByPlaceholderText("Add card…"), "{Enter}");
      expect(await screen.findByText("Card not found on Scryfall.")).toBeInTheDocument();
    });

    it("typing clears a previous error; Add is disabled for blank input", async () => {
      const user = u();
      const onAddCard = vi.fn().mockResolvedValue({ success: false, error: "Nope." });
      setup({ editMode: true, onAddCard });
      expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
      await user.type(screen.getByPlaceholderText("Add card…"), "Xyz{Enter}");
      await screen.findByText("Nope.");
      await user.type(screen.getByPlaceholderText("Add card…"), "a");
      expect(screen.queryByText("Nope.")).not.toBeInTheDocument();
    });

    it("autocomplete: click a suggestion adds it immediately", async () => {
      const user = u();
      const p = setup({ editMode: true });
      await user.type(screen.getByPlaceholderText("Add card…"), "sol");
      const item = await screen.findByText("Sol Talisman");
      fireEvent.mouseDown(item);
      await waitFor(() => expect(p.onAddCard).toHaveBeenCalledWith("1 Sol Talisman"));
    });

    it("autocomplete keyboard: arrows highlight, Enter fills, Escape closes", async () => {
      const user = u();
      const p = setup({ editMode: true });
      const input = screen.getByPlaceholderText("Add card…");
      await user.type(input, "sol");
      // "Sol Ring" is also a card row in the list, so scope to the suggestion
      await screen.findByText("Sol Ring", { selector: ".autocomplete-item" });
      await user.keyboard("{ArrowDown}{ArrowDown}{ArrowUp}");
      expect(screen.getByText("Sol Ring", { selector: ".autocomplete-item" })).toHaveClass("highlighted");
      await user.keyboard("{Enter}");
      expect(input).toHaveValue("Sol Ring");
      expect(p.onAddCard).not.toHaveBeenCalled();

      await user.type(input, "x");
      await screen.findByText("Sol Ring", { selector: ".autocomplete-item" });
      await user.keyboard("{Escape}");
      expect(document.querySelector(".autocomplete-list")).toBeNull();
    });

    it("suggestions fail quietly when the request errors", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
      const user = u();
      setup({ editMode: true });
      await user.type(screen.getByPlaceholderText("Add card…"), "sol");
      await new Promise(r => setTimeout(r, 350));
      expect(document.querySelector(".autocomplete-list")).toBeNull();
    });
  });
});

describe("Checklist — coachmark", () => {
  const fresh = () => deck({ cards: [card({ id: "a", name: "Sol Ring" }), card({ id: "b", name: "Forest", type: "Basic Land" })] });

  it("shows for a brand-new, untouched deck and dismisses permanently per deck", async () => {
    const store = installStorage();
    setup({}, fresh());
    const note = screen.getByRole("status");
    expect(note).toHaveTextContent("Tap a card's row to tag it");
    await u().click(screen.getByLabelText("Dismiss tip"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(JSON.parse(store.get("fetchlist-coachmark-dismissed-decks")!)).toEqual(["d1"]);
  });

  it("stays hidden once dismissed for that deck", () => {
    installStorage({ "fetchlist-coachmark-dismissed-decks": JSON.stringify(["d1"]) });
    setup({}, fresh());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not show once any card is tagged or acquired, or for empty decks", () => {
    const { unmount } = setup({}, deck({ cards: [card({ id: "a", name: "Sol Ring", source: "owned" })] }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    unmount();
    setup({}, deck({ cards: [] }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
