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
        <button className="collection-printing-save" onClick={onCommitEdit} aria-label="Save">✓</button>
        <button className="collection-printing-cancel" onClick={onCancelEdit} aria-label="Cancel">✕</button>
      </li>
    );
  }

  function renderPrintingView(p: CollectionPrinting, i: number) {
    const label = [
      p.set ? p.set.toUpperCase() : null,
      `${p.quantity}×`,
      p.collectorNumber ? `#${p.collectorNumber}` : null,
      p.foil ? "Foil" : null,
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
          {p.foil && <span className="collection-printing-foil">Foil</span>}
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
      {/* In-decks callout — leads the expansion when card is in any deck */}
      {hasDeckContext && committed.deckCount > 0 && (
        <div className="collection-indecks-callout">
          <span className="collection-indecks-arrow">→</span>
          <span className="collection-indecks-count">
            {committed.total} in {committed.deckCount === 1 ? "deck" : "decks"}
          </span>
          {committed.decks.length > 0 && (
            <span className="collection-indecks-names">
              {committed.decks.map(d => `${d.name} (${d.qty})`).join(" · ")}
            </span>
          )}
        </div>
      )}

      {/* Printings section */}
      <div className="collection-printings-section">
        <span className="collection-printings-eyebrow">
          PRINTINGS · {printings.length}
        </span>
        <ul className="collection-printings">
          {printings.map((p, i) => {
            const isEditingThis = ep?.key === name && ep?.idx === i;
            return isEditingThis && ep ? renderEditForm(ep) : renderPrintingView(p, i);
          })}
          {isAddingNew && ep && renderEditForm(ep)}
        </ul>
      </div>

      {/* Action bar */}
      <div className="collection-detail-footer">
        <div className="collection-detail-footer-left">
          <button className="btn btn-ghost btn-sm" onClick={() => onAddCopy(name)}>
            + Add copy
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={startNewPrinting}
            disabled={isAddingNew}
          >
            + Printing
          </button>
        </div>
        <button className="btn btn-ghost btn-sm collection-remove-all-btn" onClick={() => onRemove(name)}>
          Remove all
        </button>
      </div>
    </div>
  );
}
