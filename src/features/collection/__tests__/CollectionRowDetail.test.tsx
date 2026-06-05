import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CollectionRowDetail } from "../components/CollectionRowDetail";
import type { CommittedInfo } from "../../../types/collection";
import type { CollectionPrinting } from "../../../types/index";

const noneCommitted: CommittedInfo = { total: 0, deckCount: 0, decks: [] };

const twoDecks: CommittedInfo = {
  total: 3,
  deckCount: 2,
  decks: [
    { name: "Atraxa Superfriends", qty: 2 },
    { name: "Krenko Goblins", qty: 1 },
  ],
};

const printings: CollectionPrinting[] = [
  { quantity: 2, set: "CMR", collectorNumber: "472" },
  { quantity: 1, foil: true },
];

const baseProps = {
  name: "sol ring",
  printings,
  committed: noneCommitted,
  hasDeckContext: false,
  editingPrinting: null,
  onAddCopy: vi.fn(),
  onStartEdit: vi.fn(),
  onEditField: vi.fn(),
  onCommitEdit: vi.fn(),
  onCancelEdit: vi.fn(),
  onRemove: vi.fn(),
};

describe("CollectionRowDetail — in-decks callout", () => {
  it("is hidden when card is not in any deck", () => {
    render(<CollectionRowDetail {...baseProps} committed={noneCommitted} hasDeckContext={true} />);
    expect(screen.queryByText(/in deck/i)).not.toBeInTheDocument();
  });

  it("is hidden when hasDeckContext is false even if committed total > 0", () => {
    render(
      <CollectionRowDetail {...baseProps} committed={twoDecks} hasDeckContext={false} />
    );
    expect(screen.queryByText(/in deck/i)).not.toBeInTheDocument();
  });

  it("shows callout with correct total when card is in decks", () => {
    render(
      <CollectionRowDetail {...baseProps} committed={twoDecks} hasDeckContext={true} />
    );
    expect(screen.getByText(/3 in decks/i)).toBeInTheDocument();
  });

  it("lists each deck name in the callout", () => {
    render(
      <CollectionRowDetail {...baseProps} committed={twoDecks} hasDeckContext={true} />
    );
    expect(screen.getByText(/Atraxa Superfriends/)).toBeInTheDocument();
    expect(screen.getByText(/Krenko Goblins/)).toBeInTheDocument();
  });

  it("uses singular 'deck' when deckCount is 1", () => {
    const oneCommitted: CommittedInfo = {
      total: 1,
      deckCount: 1,
      decks: [{ name: "Atraxa", qty: 1 }],
    };
    render(
      <CollectionRowDetail {...baseProps} committed={oneCommitted} hasDeckContext={true} />
    );
    expect(screen.getByText(/1 in deck$/i)).toBeInTheDocument();
  });
});

describe("CollectionRowDetail — printings section", () => {
  it("renders PRINTINGS eyebrow with correct count", () => {
    render(<CollectionRowDetail {...baseProps} />);
    expect(screen.getByText(`PRINTINGS · ${printings.length}`)).toBeInTheDocument();
  });

  it("shows set chip for printings that have a set", () => {
    render(<CollectionRowDetail {...baseProps} />);
    expect(screen.getByText("CMR")).toBeInTheDocument();
  });

  it("shows foil label for foil printings", () => {
    render(<CollectionRowDetail {...baseProps} />);
    expect(screen.getByText("Foil")).toBeInTheDocument();
  });

  it("renders an Edit button for each printing", () => {
    render(<CollectionRowDetail {...baseProps} />);
    const editBtns = screen.getAllByRole("button", { name: /edit/i });
    expect(editBtns).toHaveLength(printings.length);
  });
});

describe("CollectionRowDetail — action bar", () => {
  it("calls onAddCopy with card name when Add copy is clicked", () => {
    const onAddCopy = vi.fn();
    render(<CollectionRowDetail {...baseProps} onAddCopy={onAddCopy} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ add copy/i }));
    expect(onAddCopy).toHaveBeenCalledWith("sol ring");
  });

  it("calls onStartEdit with idx=printings.length when + Printing is clicked", () => {
    const onStartEdit = vi.fn();
    render(<CollectionRowDetail {...baseProps} onStartEdit={onStartEdit} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ printing/i }));
    expect(onStartEdit).toHaveBeenCalledWith(
      expect.objectContaining({ key: "sol ring", idx: printings.length })
    );
  });

  it("calls onRemove with card name when Remove all is clicked", () => {
    const onRemove = vi.fn();
    render(<CollectionRowDetail {...baseProps} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: /remove all/i }));
    expect(onRemove).toHaveBeenCalledWith("sol ring");
  });

  it("disables + Printing button while a new printing is being added", () => {
    render(
      <CollectionRowDetail
        {...baseProps}
        editingPrinting={{
          key: "sol ring",
          idx: printings.length,
          qty: "1",
          set: "",
          cn: "",
          foil: false,
        }}
      />
    );
    expect(screen.getByRole("button", { name: /\+ printing/i })).toBeDisabled();
  });
});

describe("CollectionRowDetail — inline print edit form", () => {
  it("shows the edit form in place of the targeted printing row", () => {
    render(
      <CollectionRowDetail
        {...baseProps}
        editingPrinting={{ key: "sol ring", idx: 0, qty: "2", set: "CMR", cn: "472", foil: false }}
      />
    );
    expect(screen.getByLabelText("Quantity")).toBeInTheDocument();
    // Edit buttons only show for non-editing rows (idx 1 here)
    expect(screen.getAllByRole("button", { name: /edit/i })).toHaveLength(1);
  });

  it("calls onCommitEdit on Enter in the qty field", () => {
    const onCommitEdit = vi.fn();
    render(
      <CollectionRowDetail
        {...baseProps}
        onCommitEdit={onCommitEdit}
        editingPrinting={{ key: "sol ring", idx: 0, qty: "2", set: "", cn: "", foil: false }}
      />
    );
    fireEvent.keyDown(screen.getByLabelText("Quantity"), { key: "Enter" });
    expect(onCommitEdit).toHaveBeenCalled();
  });

  it("calls onCancelEdit on Escape in the qty field", () => {
    const onCancelEdit = vi.fn();
    render(
      <CollectionRowDetail
        {...baseProps}
        onCancelEdit={onCancelEdit}
        editingPrinting={{ key: "sol ring", idx: 0, qty: "2", set: "", cn: "", foil: false }}
      />
    );
    fireEvent.keyDown(screen.getByLabelText("Quantity"), { key: "Escape" });
    expect(onCancelEdit).toHaveBeenCalled();
  });
});
