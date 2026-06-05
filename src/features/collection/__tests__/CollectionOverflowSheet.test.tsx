import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CollectionOverflowSheet } from "../components/CollectionOverflowSheet";
import type { CollectionMeta } from "../../../types/index";

const meta: CollectionMeta = {
  fileName: "moxfield_haves.csv",
  importedAt: Date.now() - 86_400_000 * 3, // 3 days ago
  cardCount: 1247,
};

const baseProps = {
  collectionMeta: meta,
  onClose: vi.fn(),
  onUploadClick: vi.fn(),
  onBulkEditClick: vi.fn(),
};

describe("CollectionOverflowSheet — content", () => {
  it("renders Bulk edit action", () => {
    render(<CollectionOverflowSheet {...baseProps} />);
    expect(screen.getByText("Bulk edit")).toBeInTheDocument();
  });

  it("shows Replace CSV when collection is loaded", () => {
    render(<CollectionOverflowSheet {...baseProps} collectionMeta={meta} />);
    expect(screen.getByText("Replace CSV")).toBeInTheDocument();
  });

  it("shows Upload CSV when no collection is loaded", () => {
    render(<CollectionOverflowSheet {...baseProps} collectionMeta={null} />);
    expect(screen.getByText("Upload CSV")).toBeInTheDocument();
  });

  it("does not show Replace CSV when no collection is loaded", () => {
    render(<CollectionOverflowSheet {...baseProps} collectionMeta={null} />);
    expect(screen.queryByText("Replace CSV")).not.toBeInTheDocument();
  });

  it("shows provenance meta inside the Replace CSV row", () => {
    render(<CollectionOverflowSheet {...baseProps} collectionMeta={meta} />);
    expect(screen.getByText(/moxfield_haves\.csv/)).toBeInTheDocument();
  });

  it("renders Cancel action", () => {
    render(<CollectionOverflowSheet {...baseProps} />);
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });
});

// onClose fires after a 220ms animation delay — use fake timers throughout
describe("CollectionOverflowSheet — dismiss", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<CollectionOverflowSheet {...baseProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    vi.advanceTimersByTime(220);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not call onClose for other keys", () => {
    const onClose = vi.fn();
    render(<CollectionOverflowSheet {...baseProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Enter" });
    fireEvent.keyDown(document, { key: "Tab" });
    vi.advanceTimersByTime(220);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when the Cancel button is clicked", () => {
    const onClose = vi.fn();
    render(<CollectionOverflowSheet {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Cancel"));
    vi.advanceTimersByTime(220);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when the backdrop scrim is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(
      <CollectionOverflowSheet {...baseProps} onClose={onClose} />
    );
    const scrim = container.ownerDocument.querySelector(".card-row-sheet-scrim");
    expect(scrim).toBeInTheDocument();
    fireEvent.click(scrim!);
    vi.advanceTimersByTime(220);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("CollectionOverflowSheet — actions", () => {
  it("calls onBulkEditClick when Bulk edit is tapped", () => {
    const onBulkEditClick = vi.fn();
    render(<CollectionOverflowSheet {...baseProps} onBulkEditClick={onBulkEditClick} />);
    fireEvent.click(screen.getByText("Bulk edit"));
    expect(onBulkEditClick).toHaveBeenCalled();
  });

  it("calls onUploadClick when Replace CSV is tapped", () => {
    const onUploadClick = vi.fn();
    render(<CollectionOverflowSheet {...baseProps} onUploadClick={onUploadClick} />);
    fireEvent.click(screen.getByText("Replace CSV"));
    expect(onUploadClick).toHaveBeenCalled();
  });

  it("calls onUploadClick when Upload CSV is tapped (no meta)", () => {
    const onUploadClick = vi.fn();
    render(
      <CollectionOverflowSheet
        {...baseProps}
        collectionMeta={null}
        onUploadClick={onUploadClick}
      />
    );
    fireEvent.click(screen.getByText("Upload CSV"));
    expect(onUploadClick).toHaveBeenCalled();
  });
});
