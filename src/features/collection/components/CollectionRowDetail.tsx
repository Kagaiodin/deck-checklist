import type { CollectionPrinting } from "../../../types/index";
import type { CommittedInfo, EditingPrinting } from "../../../types/collection";

interface CollectionRowDetailProps {
  name: string;
  printings: CollectionPrinting[];
  committed: CommittedInfo;
  hasDeckContext: boolean;
  editingPrinting: EditingPrinting | null;
  onAddCopy: (name: string) => void;
  onStartEdit: (ep: EditingPrinting) => void;
  onEditField: (ep: EditingPrinting) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onRemove: (name: string) => void;
}

export function CollectionRowDetail({
  name,
  printings,
  committed,
  hasDeckContext,
  editingPrinting,
  onAddCopy,
  onStartEdit,
  onEditField,
  onCommitEdit,
  onCancelEdit,
  onRemove,
}: CollectionRowDetailProps) {
  const ep = editingPrinting;
  // True when the user clicked "+ Printing" — editing a not-yet-existent entry
  const isAddingNew = ep?.key === name && ep?.idx === printings.length;

  function startEditExisting(p: CollectionPrinting, i: number) {
    onStartEdit({
      key:  name,
      idx:  i,
      qty:  String(p.quantity),
      set:  p.set ?? "",
      cn:   p.collectorNumber ?? "",
      foil: p.foil ?? false,
    });
  }

  function startNewPrinting() {
    onStartEdit({ key: name, idx: printings.length, qty: "1", set: "", cn: "", foil: false });
  }

  function renderEditForm(epRow: EditingPrinting) {
    const kd = (e: React.KeyboardEvent) => {
      if (e.key === "Enter")  onCommitEdit();
      if (e.key === "Escape") onCancelEdit();
    };
    return (
      <li className="collection-printing editing">
        <input
          type="number"
          min="0"
          className="collection-printing-input collection-printing-qty-input"
          value={epRow.qty}
          autoFocus
          onChange={e => onEditField({ ...epRow, qty: e.target.value })}
          onKeyDown={kd}
          aria-label="Quantity"
        />
        <span className="collection-printing-x">×</span>
        <input
          type="text"
          className="collection-printing-input collection-printing-set-input"
          value={epRow.set}
          placeholder="Set"
          onChange={e => onEditField({ ...epRow, set: e.target.value })}
          onKeyDown={kd}
        />
        <input
          type="text"
          className="collection-printing-input collection-printing-cn-input"
          value={epRow.cn}
          placeholder="#CN"
          onChange={e => onEditField({ ...epRow, cn: e.target.value })}
          onKeyDown={kd}
        />
        <label className="collection-printing-foil-label">
          <input
            type="checkbox"
            checked={epRow.foil}
            onChange={e => onEditField({ ...epRow, foil: e.target.checked })}
          />
          Foil
        </label>
        <button
          className="collection-printing-save"
          onClick={onCommitEdit}
          aria-label="Save"
        >✓</button>
        <button
          className="collection-printing-cancel"
          onClick={onCancelEdit}
          aria-label="Cancel"
        >✕</button>
      </li>
    );
  }

  function renderPrintingView(p: CollectionPrinting, i: number) {
    const label = [
      p.set ? p.set.toUpperCase() : null,
      `${p.quantity}×`,
      p.collectorNumber ? `#${p.collectorNumber}` : null,
      p.foil ? "✦ Foil" : null,
    ].filter(Boolean).join(" ");

    return (
      <li key={i} className="collection-printing">
        <div className="collection-printing-display">
          {p.set && (
            <span className="collection-printing-set-chip">{p.set.toUpperCase()}</span>
          )}
          <span className="collection-printing-qty">{p.quantity}×</span>
          {p.collectorNumber && (
            <span className="collection-printing-cn">#{p.collectorNumber}</span>
          )}
          {p.foil && <span className="collection-printing-foil">✦ Foil</span>}
          <button
            className="collection-printing-edit-btn"
            onClick={() => startEditExisting(p, i)}
            aria-label={`Edit ${label}`}
          >
            Edit
          </button>
        </div>
      </li>
    );
  }

  return (
    <div className="collection-row-detail">
      {/* Printing list */}
      <ul className="collection-printings">
        {printings.map((p, i) => {
          const isEditingThis = ep?.key === name && ep?.idx === i;
          return isEditingThis && ep ? renderEditForm(ep) : renderPrintingView(p, i);
        })}
        {/* New-printing edit form (+ Printing was clicked) */}
        {isAddingNew && ep && renderEditForm(ep)}
      </ul>

      {/* Deck breakdown bar */}
      {hasDeckContext && committed.total > 0 && (
        <div className="collection-deck-breakdown">
          <span className="collection-deck-breakdown-arrow">→</span>
          <span className="collection-deck-breakdown-count">
            {committed.total} in deck{committed.deckCount !== 1 ? "s" : ""}
          </span>
          {committed.decks.length > 0 && (
            <>
              <span className="collection-deck-breakdown-sep">·</span>
              <span className="collection-deck-breakdown-names">
                {committed.decks.map(d => `${d.name} (${d.qty})`).join(", ")}
              </span>
            </>
          )}
        </div>
      )}

      {/* Footer actions */}
      <div className="collection-detail-footer">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => onAddCopy(name)}
        >
          + Add copy
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={startNewPrinting}
          disabled={isAddingNew}
        >
          + Printing
        </button>
        <button
          className="btn btn-ghost btn-sm collection-remove-all-btn"
          onClick={() => onRemove(name)}
        >
          Remove all
        </button>
      </div>
    </div>
  );
}
