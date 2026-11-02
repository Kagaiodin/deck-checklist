import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollectionHeader } from "../components/CollectionHeader";

const meta = { fileName: "moxfield.csv", importedAt: Date.now(), cardCount: 100 };

function setup(over: Partial<React.ComponentProps<typeof CollectionHeader>> = {}) {
  const props: React.ComponentProps<typeof CollectionHeader> = {
    collectionMeta: meta,
    totalCards: 1500,
    uniqueCards: 1200,
    deckCardTotal: 300,
    hasDeckContext: true,
    filteredCount: 40,
    onUploadClick: vi.fn(),
    onQuickAddClick: vi.fn(),
    onBulkEditClick: vi.fn(),
    onOverflowOpen: vi.fn(),
    collectionSearch: "",
    onSearchChange: vi.fn(),
    collectionFilter: "all",
    onFilterChange: vi.fn(),
    pillCounts: { all: 1200, "in-deck": 10, free: 20, foils: 5 },
    collectionSort: "name-asc",
    onSortChange: vi.fn(),
    ...over,
  };
  const utils = render(<CollectionHeader {...props} />);
  return { ...props, ...utils };
}

describe("CollectionHeader", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-06-15T12:00:00Z")); });
  afterEach(() => { vi.useRealTimers(); });

  it("shows formatted counts and a search placeholder", () => {
    setup();
    expect(screen.getByText("1,500", { selector: ".collection-topbar-count" })).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText("Search 1,200 cards…")).toHaveLength(2);
  });

  it("omits counts and provenance without collection meta", () => {
    const { container } = setup({ collectionMeta: null });
    expect(container.querySelector(".collection-topbar-count")).toBeNull();
    expect(container.querySelector(".collection-stats-line")).toBeNull();
    expect(container.querySelector(".collection-mobile-count-label")).toBeNull();
  });

  it("stats line includes the filename, deck context and relative time", () => {
    const { container } = setup({
      collectionMeta: { ...meta, importedAt: Date.now() - 3 * 86_400_000 },
    });
    const line = container.querySelector(".collection-stats-line")!;
    expect(line).toHaveTextContent("1,500 cards · 1,200 unique · 300 in decks · from moxfield.csv · 3 days ago");
  });

  it.each([[0, "today"], [1, "yesterday"]])("relative time %i days → %s", (days, label) => {
    const { container } = setup({ collectionMeta: { ...meta, importedAt: Date.now() - days * 86_400_000 } });
    expect(container.querySelector(".collection-stats-line")).toHaveTextContent(label);
  });

  it("hides 'in decks' without deck context", () => {
    const { container } = setup({ hasDeckContext: false });
    expect(container.querySelector(".collection-stats-line")).not.toHaveTextContent("in decks");
  });

  it("mobile label shows filtered vs unique count", () => {
    const { container } = setup();
    expect(container.querySelector(".collection-mobile-count-label")).toHaveTextContent("SHOWING 40 OF 1,200");
  });

  it("forwards search input from both desktop and mobile fields", () => {
    const { onSearchChange } = setup();
    const [desktop, mobile] = screen.getAllByPlaceholderText(/Search/);
    fireEvent.change(desktop, { target: { value: "bolt" } });
    fireEvent.change(mobile, { target: { value: "ring" } });
    expect(onSearchChange).toHaveBeenNthCalledWith(1, "bolt");
    expect(onSearchChange).toHaveBeenNthCalledWith(2, "ring");
  });

  it("filter chips: desktop shows counts, active chip highlighted, click changes filter", async () => {
    const { onFilterChange, container } = setup({ collectionFilter: "free" });
    const desktop = container.querySelector(".collection-filter-chips--inline") as HTMLElement;
    expect(within(desktop).getByRole("button", { name: /In decks\s*10/ })).toBeInTheDocument();
    expect(within(desktop).getByRole("button", { name: /Unassigned\s*20/ })).toHaveClass("active");
    expect(within(desktop).getByRole("button", { name: /All\s*1,200/ })).toBeInTheDocument();
    await userEvent.setup({ delay: null }).click(within(desktop).getByRole("button", { name: /Foils/ }));
    expect(onFilterChange).toHaveBeenCalledWith("foils");

    const mobile = container.querySelector(".collection-filter-chips--mobile-row") as HTMLElement;
    await userEvent.setup({ delay: null }).click(within(mobile).getByRole("button", { name: "In decks" }));
    expect(onFilterChange).toHaveBeenCalledWith("in-deck");
  });

  it("desktop sort: opens popover showing current label, picks an option, closes", async () => {
    const user = userEvent.setup({ delay: null });
    const { onSortChange } = setup({ collectionSort: "qty-desc" });
    await user.click(screen.getByTitle("Qty ↓"));
    // desktop and mobile share sortOpen state, so both popovers render
    await user.click(screen.getAllByText("Name Z→A")[0]);
    expect(onSortChange).toHaveBeenCalledWith("name-desc");
    expect(document.querySelector(".sort-popover")).toBeNull();
  });

  it("mobile sort icon opens the popover; outside click closes it, inside does not", async () => {
    const user = userEvent.setup({ delay: null });
    setup();
    await user.click(screen.getByRole("button", { name: "Sort: Name A→Z" }));
    const pop = document.querySelector(".sort-popover") as HTMLElement;
    expect(pop).toBeInTheDocument();
    fireEvent.mouseDown(pop);
    expect(document.querySelector(".sort-popover")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(document.querySelector(".sort-popover")).toBeNull();
  });

  it("+ Add triggers quick add", async () => {
    const { onQuickAddClick } = setup();
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "+ Add" }));
    expect(onQuickAddClick).toHaveBeenCalled();
  });

  it("overflow menu: Replace CSV when a collection exists", async () => {
    const user = userEvent.setup({ delay: null });
    const { onUploadClick } = setup();
    await user.click(screen.getAllByRole("button", { name: "More options" })[0]);
    expect(screen.queryByText("Upload CSV")).not.toBeInTheDocument();
    await user.click(screen.getByText("Replace CSV"));
    expect(onUploadClick).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("overflow menu: Upload CSV with no collection, and Bulk edit", async () => {
    const user = userEvent.setup({ delay: null });
    const { onUploadClick, onBulkEditClick } = setup({ collectionMeta: null });
    await user.click(screen.getAllByRole("button", { name: "More options" })[0]);
    await user.click(screen.getByText("Upload CSV"));
    expect(onUploadClick).toHaveBeenCalled();

    await user.click(screen.getAllByRole("button", { name: "More options" })[0]);
    await user.click(screen.getByText("Bulk edit"));
    expect(onBulkEditClick).toHaveBeenCalled();
  });

  it("overflow menu: Trade calculator only appears when provided", async () => {
    const user = userEvent.setup({ delay: null });
    const onOpenTrade = vi.fn();
    const first = setup();
    await user.click(screen.getAllByRole("button", { name: "More options" })[0]);
    expect(screen.queryByText("Trade calculator")).not.toBeInTheDocument();
    first.unmount();

    setup({ onOpenTrade });
    await user.click(screen.getAllByRole("button", { name: "More options" })[0]);
    await user.click(screen.getByText(/Trade calculator/));
    expect(onOpenTrade).toHaveBeenCalled();
  });

  it("overflow menu closes on outside mousedown", async () => {
    const user = userEvent.setup({ delay: null });
    setup();
    await user.click(screen.getAllByRole("button", { name: "More options" })[0]);
    fireEvent.mouseDown(screen.getByRole("menu"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("mobile ⋯ calls onOverflowOpen", async () => {
    const { onOverflowOpen } = setup();
    await userEvent.setup({ delay: null }).click(screen.getAllByRole("button", { name: "More options" })[1]);
    expect(onOverflowOpen).toHaveBeenCalled();
  });
});
