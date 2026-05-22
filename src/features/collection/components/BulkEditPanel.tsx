import type { Collection, CollectionMeta } from "../../../types/index";
import type { BulkEditMode, BulkPreview } from "../../../types/collection";

interface BulkEditPanelProps {
  collection: Collection;
  collectionMeta: CollectionMeta | null;
  bulkEditMode: BulkEditMode;
  onModeChange: (mode: BulkEditMode) => void;
  bulkEditText: string;
  onTextChange: (text: string) => void;
  bulkPreview: BulkPreview | null;
  bulkEditError: string | null;
  clearConfirming: boolean;
  onClearConfirmChange: (v: boolean) => void;
  onApply: () => void;
  onClear: () => void;
  onClose: () => void;
}

export function BulkEditPanel({
  collection,
  collectionMeta,
  bulkEditMode,
  onModeChange,
  bulkEditText,
  onTextChange,
  bulkPreview,
  bulkEditError,
  clearConfirming,
  onClearConfirmChange,
  onApply,
  onClear,
  onClose,
}: BulkEditPanelProps) {
  const isReplace      = bulkEditMode === "replace";
  const collectionSize = Object.keys(collection).length;
  const removedCount   = collectionSize - (bulkPreview?.updated ?? 0);

  return (
    <div className="collection-bulk-panel">

      {/* ── Panel header ── */}
      <div className="bulk-panel-header">
        <div className="bulk-panel-title-group">
          <span className="bulk-panel-title">Bulk edit</span>
          <span className="bulk-panel-subtitle">paste decklist format</span>
        </div>
        <button className="bulk-panel-close" onClick={onClose} aria-label="Close bulk edit">
          Close
        </button>
      </div>

      {/* ── Mode tabs ── */}
      <div className="bulk-tabs">
        <button
          className={`bulk-tab${bulkEditMode === "merge" ? " active" : ""}`}
          onClick={() => onModeChange("merge")}
        >
          <span>Add to collection</span>
          <span className="bulk-tab-sub">unlisted unchanged</span>
        </button>
        <button
          className={`bulk-tab${isReplace ? " active danger" : ""}`}
          onClick={() => onModeChange("replace")}
        >
          <span>Replace all</span>
          <span className="bulk-tab-sub">unlisted removed</span>
        </button>
      </div>

      {/* ── Textarea ── */}
      <textarea
        className="import-textarea bulk-textarea"
        value={bulkEditText}
        onChange={e => onTextChange(e.target.value)}
        placeholder={"4 Lightning Bolt\n2x Snapcaster Mage\n1 Black Lotus"}
        rows={6}
      />

      {/* ── Preview line ── */}
      <div className="bulk-preview-line">
        <span className="bulk-preview-lbl">Preview</span>
        {bulkPreview ? (
          <span className="bulk-preview-counts">
            {bulkPreview.added > 0 && (
              <span className="bulk-preview-new">+{bulkPreview.added} new</span>
            )}
            {bulkPreview.added > 0 && bulkPreview.updated > 0 && (
              <span className="bulk-preview-sep"> · </span>
            )}
            {bulkPreview.updated > 0 && (
              <span className="bulk-preview-set">{bulkPreview.updated} set</span>
            )}
            {bulkPreview.removed > 0 && (
              <>
                <span className="bulk-preview-sep"> · </span>
                <span className="bulk-preview-removed">{bulkPreview.removed} removed</span>
              </>
            )}
          </span>
        ) : (
          <span className="bulk-preview-empty">—</span>
        )}
      </div>

      {bulkEditError && <p className="import-error">{bulkEditError}</p>}

      {/* ── Apply / Cancel ── */}
      <div className="collection-bulk-actions">
        <button
          className="btn btn-primary btn-sm"
          onClick={onApply}
          disabled={!bulkEditText.trim()}
        >
          Apply
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          Cancel
        </button>
      </div>

      {/* ── Danger zone ── */}
      <hr className="bulk-divider" />
      <div className="bulk-danger-zone">
        <span className="bulk-danger-label">Danger zone</span>
        {!clearConfirming ? (
          <button
            className="btn btn-ghost btn-sm bulk-clear-btn"
            onClick={() => onClearConfirmChange(true)}
          >
            Clear entire collection
          </button>
        ) : (
          <div className="bulk-clear-confirm">
            <span>Remove all {collectionMeta?.cardCount.toLocaleString()} cards?</span>
            <button
              className="btn btn-ghost btn-sm bulk-clear-btn"
              onClick={() => { onClear(); onClose(); }}
            >
              Yes, clear
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onClearConfirmChange(false)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* ── Replace warning (shown when Replace tab is active) ── */}
      {isReplace && collectionSize > 0 && (
        <>
          <hr className="bulk-divider" />
          <div className="bulk-warn">
            <span className="bulk-warn-ico">⚠</span>
            <div>
              <strong>This will remove {removedCount.toLocaleString()} cards</strong>
              <p>
                Everything not in your paste will be deleted.
                Owned-tags across all decks will be cleared.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
