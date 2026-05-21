import type { CollectionPrinting } from "../../../types/index";
import type { CommittedInfo, EditingPrinting } from "../../../types/collection";
import { CollectionRowDetail } from "./CollectionRowDetail";

interface CollectionRowProps {
  name: string;
  printings: CollectionPrinting[];
  total: number;
  isExpanded: boolean;
  committed: CommittedInfo;
  hasDeckContext: boolean;
  editingPrinting: EditingPrinting | null;
  onToggleExpand: (name: string) => void;
  onDecrement: (name: string) => void;
  onIncrement: (name: string) => void;
  onRemove: (name: string) => void;
  onStartEdit: (ep: EditingPrinting) => void;
  onEditField: (ep: EditingPrinting) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
}

/** Derives a display name by title-casing word boundaries in the lowercase key. */
function toDisplayName(key: string): string {
  return key.replace(/(?:^|\s|-)\S/g, c => c.toUpperCase());
}

export function CollectionRow({
  name,
  printings,
  total,
  isExpanded,
  committed,
  hasDeckContext,
  editingPrinting,
  onToggleExpand,
  onDecrement,
  onIncrement,
  onRemove,
  onStartEdit,
  onEditField,
  onCommitEdit,
  onCancelEdit,
}: CollectionRowProps) {
  return (
    <div
      data-collection-key={name}
      className={`collection-row${isExpanded ? " expanded" : ""}`}
    >
      <div className="collection-row-summary">
        <button
          className="collection-row-expand"
          onClick={() => onToggleExpand(name)}
        >
          <span className="collection-card-name">{toDisplayName(name)}</span>
          {committed.total > 0 && hasDeckContext && (
            <span className="collection-deck-chip">
              in {committed.deckCount} deck{committed.deckCount !== 1 ? "s" : ""}
            </span>
          )}
          <span className="collection-expand-chevron">{isExpanded ? "▴" : "▾"}</span>
        </button>
        <div className="collection-row-controls">
          <button
            className="collection-qty-btn"
            onClick={() => onDecrement(name)}
            aria-label="Remove one"
          >−</button>
          <span className="collection-card-qty">{total}×</span>
          <button
            className="collection-qty-btn"
            onClick={() => onIncrement(name)}
            aria-label="Add one"
          >+</button>
        </div>
      </div>

      {isExpanded && (
        <CollectionRowDetail
          name={name}
          printings={printings}
          committed={committed}
          hasDeckContext={hasDeckContext}
          editingPrinting={editingPrinting}
          onStartEdit={onStartEdit}
          onEditField={onEditField}
          onCommitEdit={onCommitEdit}
          onCancelEdit={onCancelEdit}
          onRemove={onRemove}
        />
      )}
    </div>
  );
}
