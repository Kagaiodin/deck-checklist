import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollectionHeader } from "../components/CollectionHeader";
import { CollectionOverflowSheet } from "../components/CollectionOverflowSheet";

const HELPER = "Weigh a trade. Doesn't change your collection.";

const headerProps = {
  collectionMeta: null,
  totalCards: 0,
  uniqueCards: 0,
  deckCardTotal: 0,
  hasDeckContext: false,
  filteredCount: 0,
  onUploadClick: vi.fn(),
  onQuickAddClick: vi.fn(),
  onBulkEditClick: vi.fn(),
  onOverflowOpen: vi.fn(),
  collectionSearch: "",
  onSearchChange: vi.fn(),
  collectionFilter: "all" as const,
  onFilterChange: vi.fn(),
  pillCounts: { all: 0, "in-deck": 0, free: 0, foils: 0 },
  collectionSort: "name-asc" as const,
  onSortChange: vi.fn(),
};

const openDesktopMenu = async () => {
  // The header renders a desktop and a mobile ⋯; the desktop one owns the inline menu.
  await userEvent.click(screen.getAllByRole("button", { name: "More options" })[0]);
};

describe("Collection ⋯ menu — Trade calculator entry", () => {
  it("is absent unless the page provides a handler", async () => {
    render(<CollectionHeader {...headerProps} />);
    await openDesktopMenu();
    expect(screen.getByText("Bulk edit")).toBeInTheDocument();
    expect(screen.queryByText("Trade calculator")).not.toBeInTheDocument();
  });

  it("sits below a separator, after the collection actions, with the sandbox helper line", async () => {
    render(<CollectionHeader {...headerProps} onOpenTrade={vi.fn()} />);
    await openDesktopMenu();
    const menu = screen.getByRole("menu");
    const labels = within(menu).getAllByRole("button").map((b) => b.textContent);
    expect(labels).toEqual(["Upload CSV", "Bulk edit", `Trade calculator${HELPER}`]);
    expect(within(menu).getByRole("separator")).toBeInTheDocument();
    expect(within(menu).getByText(HELPER)).toBeInTheDocument();
    // Quiet by design: no icon, no count badge.
    expect(menu.querySelector("svg, .nav-badge")).toBeNull();
  });

  it("opens Trade and closes the menu", async () => {
    const onOpenTrade = vi.fn();
    render(<CollectionHeader {...headerProps} onOpenTrade={onOpenTrade} />);
    await openDesktopMenu();
    await userEvent.click(screen.getByRole("button", { name: /Trade calculator/ }));
    expect(onOpenTrade).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("Collection mobile overflow sheet — Trade calculator entry", () => {
  const sheetProps = { collectionMeta: null, onClose: vi.fn(), onUploadClick: vi.fn(), onBulkEditClick: vi.fn() };

  it("is absent unless the page provides a handler", () => {
    render(<CollectionOverflowSheet {...sheetProps} />);
    expect(screen.queryByText("Trade calculator")).not.toBeInTheDocument();
  });

  it("shows the row with the helper line", () => {
    render(<CollectionOverflowSheet {...sheetProps} onOpenTradeClick={vi.fn()} />);
    expect(screen.getByText("Trade calculator")).toBeInTheDocument();
    expect(screen.getByText(HELPER)).toBeInTheDocument();
  });

  it("opens Trade and dismisses the sheet", () => {
    vi.useFakeTimers();
    const onOpenTradeClick = vi.fn();
    const onClose = vi.fn();
    render(<CollectionOverflowSheet {...sheetProps} onClose={onClose} onOpenTradeClick={onOpenTradeClick} />);
    fireEvent.click(screen.getByText("Trade calculator"));
    vi.advanceTimersByTime(220);
    expect(onOpenTradeClick).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
