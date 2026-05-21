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
  return (
    <div className="collection-bulk-panel">
      {/* Mode tabs */}
      <div className="bulk-tabs">
        <button
          className={`bulk-tab${bulkEditMode === "merge" ? " active" : ""}`}
          onClick={() => onModeChange("merge")}
        >
          <span>Add to collection</span>
          <span className="bulk-tab-sub">unlisted unchanged</span>
        </button>
        <button
          className={`bulk-tab danger${bulkEditMode === "replace" ? " active" : ""}`}
          onClick={() => onModeChange("replace")}
        >
          <span>Replace all</span>
          <span className="bulk-tab-sub">unlisted removed</span>
        </button>
      </div>

      <textarea
        className="import-textarea bulk-textarea"
        value={bulkEditText}
        onChange={e => onTextChange(e.target.value)}
        placeholder={"4 Lightning Bolt\n2x Snapcaster Mage\n1 Black Lotus"}
        rows={7}
      />

      {/* Live preview */}
      {bulkPreview && (
        <div className="bulk-preview">
          <span className="bulk-preview-lbl">Preview</span>
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
              <span className="bulk-preview-sep"> · </span>
            )}
            {bulkPreview.removed > 0 && (
              <span className="bulk-preview-removed">{bulkPreview.removed} removed</span>
            )}
          </span>
        </div>
      )}

      {/* Replace warning */}
      {bulkEditMode === "replace" && Object.keys(collection).length > 0 && (
        <div className="bulk-warn">
          <span className="bulk-warn-ico">⚠</span>
          <div>
            <strong>
              This will remove{" "}
              {(Object.keys(collection).length - (bulkPreview?.updated ?? 0)).toLocaleString()} cards
            </strong>
            <p>Everything not in your paste will be deleted and owned-tags cleared across all decks.</p>
          </div>
        </div>
      )}

      {bulkEditError && <p className="import-error">{bulkEditError}</p>}

      <div className="collection-bulk-actions">
        <button
          className="btn btn-primary btn-sm"
          onClick={onApply}
          disabled={!bulkEditText.trim()}
        >
          Apply
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>

      {/* Danger zone */}
      {collectionMeta && (
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
              <span>Remove all {collectionMeta.cardCount.toLocaleString()} cards?</span>
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
      )}
    </div>
  );
}
