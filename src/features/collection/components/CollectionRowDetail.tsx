import type { CollectionPrinting } from "../../../types/index";
import type { CommittedInfo, EditingPrinting } from "../../../types/collection";

interface CollectionRowDetailProps {
  name: string;
  printings: CollectionPrinting[];
  committed: CommittedInfo;
  hasDeckContext: boolean;
  editingPrinting: EditingPrinting | null;
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
  onStartEdit,
  onEditField,
  onCommitEdit,
  onCancelEdit,
  onRemove,
}: CollectionRowDetailProps) {
  const ep = editingPrinting;

  return (
    <div className="collection-row-detail">
      <ul className="collection-printings">
        {printings.map((p, i) => {
          const isEditingThis = ep?.key === name && ep?.idx === i;
          return (
            <li key={i} className={`collection-printing${isEditingThis ? " editing" : ""}`}>
              {isEditingThis && ep ? (
                <>
                  <input
                    type="number"
                    min="0"
                    className="collection-printing-input collection-printing-qty-input"
                    value={ep.qty}
                    autoFocus
                    onChange={e => onEditField({ ...ep, qty: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === "Enter")  onCommitEdit();
                      if (e.key === "Escape") onCancelEdit();
                    }}
                  />
                  <span>×</span>
                  <input
                    type="text"
                    className="collection-printing-input collection-printing-set-input"
                    value={ep.set}
                    placeholder="Set"
                    onChange={e => onEditField({ ...ep, set: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === "Enter")  onCommitEdit();
                      if (e.key === "Escape") onCancelEdit();
                    }}
                  />
                  <input
                    type="text"
                    className="collection-printing-input collection-printing-cn-input"
                    value={ep.cn}
                    placeholder="#CN"
                    onChange={e => onEditField({ ...ep, cn: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === "Enter")  onCommitEdit();
                      if (e.key === "Escape") onCancelEdit();
                    }}
                  />
                  <label className="collection-printing-foil-label">
                    <input
                      type="checkbox"
                      checked={ep.foil}
                      onChange={e => onEditField({ ...ep, foil: e.target.checked })}
                    />
                    Foil
                  </label>
                  <button className="collection-printing-save"  onClick={onCommitEdit} aria-label="Save">✓</button>
                  <button className="collection-printing-cancel" onClick={onCancelEdit} aria-label="Cancel">✕</button>
                </>
              ) : (
                <button
                  className="collection-printing-display"
                  onClick={() =>
                    onStartEdit({
                      key: name,
                      idx: i,
                      qty: String(p.quantity),
                      set: p.set ?? "",
                      cn:  p.collectorNumber ?? "",
                      foil: p.foil ?? false,
                    })
                  }
                >
                  <span className="collection-printing-qty">{p.quantity}×</span>
                  <span className="collection-printing-set">
                    {p.set ?? "Unknown set"}{p.collectorNumber ? ` #${p.collectorNumber}` : ""}
                  </span>
                  {p.foil && <span className="collection-printing-foil">✦ Foil</span>}
                  <span className="collection-printing-edit-hint">Edit</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {hasDeckContext && (
        <p className="collection-committed">
          {committed.total > 0
            ? `${committed.total} committed across ${committed.deckCount} deck${committed.deckCount !== 1 ? "s" : ""}`
            : "Not in any deck"}
        </p>
      )}

      <div className="collection-detail-footer">
        <button
          className="btn btn-ghost btn-sm collection-remove-all-btn"
          onClick={() => onRemove(name)}
        >
          Remove all copies
        </button>
      </div>
    </div>
  );
}
