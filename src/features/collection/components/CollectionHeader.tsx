import type { CollectionMeta } from "../../../types/index";

function relativeTime(timestamp: number): string {
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

interface CollectionHeaderProps {
  collectionMeta: CollectionMeta | null;
  totalCards: number;
  uniqueCards: number;
  foilTotal: number;
  inDecksCount: number;
  hasDeckContext: boolean;
  onUploadClick: () => void;
  onQuickAddClick: () => void;
  quickAddOpen: boolean;
  onBulkEditClick: () => void;
  bulkEditOpen: boolean;
}

export function CollectionHeader({
  collectionMeta,
  totalCards,
  uniqueCards,
  foilTotal,
  inDecksCount,
  hasDeckContext,
  onUploadClick,
  onQuickAddClick,
  quickAddOpen,
  onBulkEditClick,
  bulkEditOpen,
}: CollectionHeaderProps) {
  return (
    <>
      {/* Title row */}
      <div className="collection-header">
        <div className="collection-title-row">
          <h2 className="collection-title">Collection</h2>
          {collectionMeta && (
            <span className="collection-unique-badge">
              {uniqueCards.toLocaleString()} unique
            </span>
          )}
        </div>
        <div className="collection-header-actions">
          {!collectionMeta && (
            <button className="btn btn-secondary btn-sm" onClick={onUploadClick}>
              Upload CSV
            </button>
          )}
          <button
            className={`btn btn-primary btn-sm${quickAddOpen ? " active" : ""}`}
            onClick={onQuickAddClick}
          >
            + Add card
          </button>
          <button
            className={`btn btn-secondary btn-sm${bulkEditOpen ? " active" : ""}`}
            onClick={onBulkEditClick}
          >
            Bulk edit
          </button>
        </div>
      </div>

      {/* Stats strip — always 3 cells once collection is loaded */}
      {collectionMeta && totalCards > 0 && (
        <div className="collection-stats-strip">
          <div className="collection-stat">
            <span className="collection-stat-num">
              {totalCards.toLocaleString()}
            </span>
            <span className="collection-stat-lbl">Total cards</span>
          </div>

          <div className="collection-stat">
            <span className="collection-stat-num">
              {hasDeckContext ? (
                <>
                  <span className="collection-stat-accent">
                    {inDecksCount.toLocaleString()}
                  </span>
                  <span className="collection-stat-slash"> / </span>
                  <span className="collection-stat-denom">
                    {uniqueCards.toLocaleString()}
                  </span>
                </>
              ) : (
                <span className="collection-stat-muted">—</span>
              )}
            </span>
            <span className="collection-stat-lbl">In a deck</span>
          </div>

          <div className="collection-stat">
            <span className="collection-stat-num">
              {foilTotal > 0 ? foilTotal.toLocaleString() : "—"}
            </span>
            <span className="collection-stat-lbl">Foils</span>
          </div>
        </div>
      )}

      {/* Compact CSV provenance line */}
      {collectionMeta && (
        <div className="collection-provenance">
          <span className="collection-provenance-from">From</span>
          <code className="collection-filename-chip">{collectionMeta.fileName}</code>
          <span className="collection-provenance-sep">·</span>
          <span className="collection-provenance-age">
            {relativeTime(collectionMeta.importedAt)}
          </span>
          <button className="collection-replace-link" onClick={onUploadClick}>
            ↺ Replace CSV
          </button>
        </div>
      )}
    </>
  );
}
