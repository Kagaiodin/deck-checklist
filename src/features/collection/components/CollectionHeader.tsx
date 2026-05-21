import type { CollectionMeta } from "../../../types/index";

interface CollectionHeaderProps {
  collectionMeta: CollectionMeta | null;
  totalCards: number;
  uniqueCards: number;
  foilTotal: number;
  inDecksCount: number;
  hasDeckContext: boolean;
  onUploadClick: () => void;
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
  onBulkEditClick,
  bulkEditOpen,
}: CollectionHeaderProps) {
  return (
    <>
      <div className="collection-header">
        <h2>My Collection</h2>
        <div className="collection-header-actions">
          <button className="btn btn-secondary btn-sm" onClick={onUploadClick}>
            {collectionMeta ? "Replace CSV" : "Upload CSV"}
          </button>
          <button
            className={`btn btn-secondary btn-sm${bulkEditOpen ? " active" : ""}`}
            onClick={onBulkEditClick}
          >
            Bulk edit
          </button>
        </div>
      </div>

      {/* Stats strip */}
      {collectionMeta && totalCards > 0 && (
        <div className="collection-stats-strip">
          <div className="collection-stat">
            <span className="collection-stat-num">{totalCards.toLocaleString()}</span>
            <span className="collection-stat-lbl">Total cards</span>
          </div>
          <div className="collection-stat">
            <span className="collection-stat-num">{uniqueCards.toLocaleString()}</span>
            <span className="collection-stat-lbl">Unique</span>
          </div>
          {hasDeckContext && (
            <div className="collection-stat">
              <span className="collection-stat-num collection-stat-accent">
                {inDecksCount.toLocaleString()}
              </span>
              <span className="collection-stat-lbl">In a deck</span>
            </div>
          )}
          {foilTotal > 0 && (
            <div className="collection-stat">
              <span className="collection-stat-num">✦ {foilTotal.toLocaleString()}</span>
              <span className="collection-stat-lbl">Foils</span>
            </div>
          )}
        </div>
      )}

      {collectionMeta && (
        <p className="collection-meta">
          {collectionMeta.fileName} · imported{" "}
          {new Date(collectionMeta.importedAt).toLocaleDateString()}
        </p>
      )}
    </>
  );
}
