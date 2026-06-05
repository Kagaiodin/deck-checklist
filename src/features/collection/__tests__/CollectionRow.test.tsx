import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CollectionRow } from "../components/CollectionRow";
import type { CommittedInfo } from "../../../types/collection";
import type { CollectionPrinting } from "../../../types/index";

const noneCommitted: CommittedInfo = { total: 0, deckCount: 0, decks: [] };
const someCommitted: CommittedInfo = {
  total: 2,
  deckCount: 1,
  decks: [{ name: "Atraxa Superfriends", qty: 2 }],
};

const onePrinting: CollectionPrinting[] = [{ quantity: 3 }];

const baseProps = {
  name: "lightning bolt",
  printings: onePrinting,
  total: 3,
  rarity: undefined as "common" | "uncommon" | "rare" | "mythic" | "special" | "bonus" | undefined,
  isExpanded: false,
  committed: noneCommitted,
  hasDeckContext: false,
  editingPrinting: null,
  onToggleExpand: vi.fn(),
  onAddCopy: vi.fn(),
  onRemove: vi.fn(),
  onStartEdit: vi.fn(),
  onEditField: vi.fn(),
  onCommitEdit: vi.fn(),
  onCancelEdit: vi.fn(),
};

describe("CollectionRow — display name", () => {
  it("title-cases the lowercase key", () => {
    render(<CollectionRow {...baseProps} />);
    expect(screen.getByText("Lightning Bolt")).toBeInTheDocument();
  });
});

describe("CollectionRow — quantity", () => {
  it("renders the total qty with × suffix", () => {
    render(<CollectionRow {...baseProps} total={5} />);
    expect(screen.getByText("5×")).toBeInTheDocument();
  });

  it("sets data-free on qty when free copies exist", () => {
    // total=3, committed.total=1 → freeCount=2
    render(
      <CollectionRow
        {...baseProps}
        total={3}
        committed={{ ...noneCommitted, total: 1 }}
        hasDeckContext={true}
      />
    );
    const qty = screen.getByText("3×");
    expect(qty).toHaveAttribute("data-free", "true");
  });

  it("does not set data-free when all copies are committed", () => {
    render(
      <CollectionRow
        {...baseProps}
        total={3}
        committed={{ ...noneCommitted, total: 3 }}
        hasDeckContext={true}
      />
    );
    const qty = screen.getByText("3×");
    expect(qty).not.toHaveAttribute("data-free");
  });
});

describe("CollectionRow — free chip", () => {
  it("shows free chip when freeCount > 0", () => {
    render(
      <CollectionRow
        {...baseProps}
        total={3}
        committed={{ ...noneCommitted, total: 1 }}
        hasDeckContext={true}
      />
    );
    expect(screen.getByText("2 free")).toBeInTheDocument();
  });

  it("hides free chip when hasDeckContext is false, even if copies are uncommitted", () => {
    // Without deck context committed.total=0, but amber is gated on hasDeckContext.
    render(<CollectionRow {...baseProps} total={3} hasDeckContext={false} committed={noneCommitted} />);
    expect(screen.queryByText(/free/)).not.toBeInTheDocument();
  });

  it("hides free chip when all copies are committed", () => {
    render(
      <CollectionRow
        {...baseProps}
        total={3}
        committed={{ ...noneCommitted, total: 3 }}
        hasDeckContext={true}
      />
    );
    expect(screen.queryByText(/free/)).not.toBeInTheDocument();
  });
});

describe("CollectionRow — rarity stripe", () => {
  it("renders stripe with rarity when no free copies", () => {
    // committed.total === total → freeCount = 0, so rarity wins
    const { container } = render(
      <CollectionRow
        {...baseProps}
        rarity="rare"
        total={3}
        committed={{ ...noneCommitted, total: 3 }}
        hasDeckContext={true}
      />
    );
    const stripe = container.querySelector(".collection-row-stripe");
    expect(stripe).toHaveAttribute("data-rarity", "rare");
  });

  it("overrides stripe to amber (free) when free copies exist, even if rarity is known", () => {
    const { container } = render(
      <CollectionRow
        {...baseProps}
        rarity="rare"
        total={3}
        committed={{ ...noneCommitted, total: 1 }}
        hasDeckContext={true}
      />
    );
    const stripe = container.querySelector(".collection-row-stripe");
    expect(stripe).toHaveAttribute("data-rarity", "free");
  });

  it("renders no stripe when rarity is unknown and no free copies", () => {
    // committed.total === total → freeCount = 0; no rarity → no stripe
    const { container } = render(
      <CollectionRow
        {...baseProps}
        rarity={undefined}
        total={3}
        committed={{ ...noneCommitted, total: 3 }}
        hasDeckContext={true}
      />
    );
    expect(container.querySelector(".collection-row-stripe")).not.toBeInTheDocument();
  });
});

describe("CollectionRow — subtitle", () => {
  it("always includes printing count", () => {
    render(<CollectionRow {...baseProps} printings={onePrinting} />);
    expect(screen.getByText(/1 printing/)).toBeInTheDocument();
  });

  it("uses plural when multiple printings", () => {
    render(
      <CollectionRow
        {...baseProps}
        printings={[{ quantity: 2 }, { quantity: 1 }]}
      />
    );
    expect(screen.getByText(/2 printings/)).toBeInTheDocument();
  });

  it("omits foil segment when foil count is 0", () => {
    render(<CollectionRow {...baseProps} printings={[{ quantity: 3, foil: false }]} />);
    expect(screen.queryByText(/foil/)).not.toBeInTheDocument();
  });

  it("includes foil count when foils exist", () => {
    render(
      <CollectionRow
        {...baseProps}
        printings={[{ quantity: 2, foil: true }, { quantity: 1 }]}
        total={3}
      />
    );
    expect(screen.getByText(/2 foil/)).toBeInTheDocument();
  });

  it("omits deck segment when not in any deck", () => {
    render(
      <CollectionRow {...baseProps} hasDeckContext={true} committed={noneCommitted} />
    );
    expect(screen.queryByText(/deck/)).not.toBeInTheDocument();
  });

  it("includes deck count when card is in decks", () => {
    render(
      <CollectionRow
        {...baseProps}
        hasDeckContext={true}
        committed={someCommitted}
      />
    );
    expect(screen.getByText(/1 deck/)).toBeInTheDocument();
  });
});

describe("CollectionRow — expand toggle", () => {
  it("calls onToggleExpand with card name when the row button is clicked", () => {
    const onToggleExpand = vi.fn();
    render(<CollectionRow {...baseProps} onToggleExpand={onToggleExpand} />);
    fireEvent.click(screen.getByRole("button", { name: /Lightning Bolt/i }));
    expect(onToggleExpand).toHaveBeenCalledWith("lightning bolt");
  });

  it("shows detail when isExpanded=true", () => {
    render(<CollectionRow {...baseProps} isExpanded={true} />);
    expect(screen.getByText(/PRINTINGS/)).toBeInTheDocument();
  });

  it("hides detail when isExpanded=false", () => {
    render(<CollectionRow {...baseProps} isExpanded={false} />);
    expect(screen.queryByText(/PRINTINGS/)).not.toBeInTheDocument();
  });
});
