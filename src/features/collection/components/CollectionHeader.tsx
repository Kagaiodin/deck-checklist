import { useState, useRef, useEffect } from "react";
import type { CollectionMeta } from "../../../types/index";
import type { CollectionFilterKey, CollectionSortKey } from "../../../types/collection";
import { SortPopover, SORT_OPTIONS } from "./SortPopover";

function relativeTime(timestamp: number): string {
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

const FILTER_LABELS: Record<CollectionFilterKey, string> = {
  all:       "All",
  "in-deck": "In decks",
  free:      "Free",
  foils:     "Foils",
};

const FILTER_KEYS: CollectionFilterKey[] = ["all", "in-deck", "free", "foils"];

interface CollectionHeaderProps {
  collectionMeta: CollectionMeta | null;
  totalCards: number;
  uniqueCards: number;
  deckCardTotal: number;
  hasDeckContext: boolean;
  filteredCount: number;
  onUploadClick: () => void;
  onQuickAddClick: () => void;
  onBulkEditClick: () => void;
  onOverflowOpen: () => void;
  collectionSearch: string;
  onSearchChange: (v: string) => void;
  collectionFilter: CollectionFilterKey;
  onFilterChange: (key: CollectionFilterKey) => void;
  pillCounts: Record<CollectionFilterKey, number>;
  collectionSort: CollectionSortKey;
  onSortChange: (key: CollectionSortKey) => void;
}

export function CollectionHeader({
  collectionMeta,
  totalCards,
  uniqueCards,
  deckCardTotal,
  hasDeckContext,
  filteredCount,
  onUploadClick,
  onQuickAddClick,
  onBulkEditClick,
  onOverflowOpen,
  collectionSearch,
  onSearchChange,
  collectionFilter,
  onFilterChange,
  pillCounts,
  collectionSort,
  onSortChange,
}: CollectionHeaderProps) {
  const [sortOpen, setSortOpen]         = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);

  const sortRef         = useRef<HTMLDivElement>(null);
  const mobileSortRef   = useRef<HTMLDivElement>(null);
  const overflowRef     = useRef<HTMLDivElement>(null);

  const currentSortLabel = SORT_OPTIONS.find(o => o.value === collectionSort)?.label ?? "Sort";

  useEffect(() => {
    if (!sortOpen && !overflowOpen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (sortOpen) {
        const inDesktop = sortRef.current?.contains(target);
        const inMobile  = mobileSortRef.current?.contains(target);
        if (!inDesktop && !inMobile) setSortOpen(false);
      }
      if (overflowOpen && overflowRef.current && !overflowRef.current.contains(target)) {
        setOverflowOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [sortOpen, overflowOpen]);

  return (
    <>
      {/* ── Desktop top bar (hidden at <768px) ─────────────────────── */}
      <div className="collection-topbar">
        <div className="collection-topbar-left">
          <span className="collection-topbar-title">Collection</span>
          {collectionMeta && (
            <span className="collection-topbar-count">{totalCards.toLocaleString()}</span>
          )}
        </div>

        <div className="collection-topbar-search">
          <span className="collection-topbar-search-icon" aria-hidden>⌕</span>
          <input
            className="collection-topbar-search-input"
            placeholder={`Search ${uniqueCards.toLocaleString()} cards…`}
            value={collectionSearch}
            onChange={e => onSearchChange(e.target.value)}
          />
        </div>

        <div className="collection-topbar-right">
          <div className="collection-filter-chips collection-filter-chips--inline">
            {FILTER_KEYS.map(f => (
              <button
                key={f}
                className={`collection-filter-chip${collectionFilter === f ? " active" : ""}`}
                onClick={() => onFilterChange(f)}
              >
                {FILTER_LABELS[f]}
                {" "}
                <span className="collection-filter-chip-count">
                  {f === "all" ? uniqueCards.toLocaleString() : pillCounts[f].toLocaleString()}
                </span>
              </button>
            ))}
          </div>

          <div className="collection-topbar-actions">
            <div className="collection-sort-wrap" ref={sortRef}>
              <button
                className={`collection-sort-btn${sortOpen ? " active" : ""}`}
                onClick={() => setSortOpen(v => !v)}
                title={currentSortLabel}
              >
                {currentSortLabel} ↕
              </button>
              {sortOpen && (
                <SortPopover
                  collectionSort={collectionSort}
                  onSortChange={onSortChange}
                  onClose={() => setSortOpen(false)}
                />
              )}
            </div>

            <button className="btn btn-primary btn-sm" onClick={onQuickAddClick}>
              + Add
            </button>

            <div className="collection-overflow-wrap" ref={overflowRef}>
              <button
                className={`collection-overflow-btn${overflowOpen ? " active" : ""}`}
                onClick={() => setOverflowOpen(v => !v)}
                aria-label="More options"
              >
                ⋯
              </button>
              {overflowOpen && (
                <div className="collection-overflow-menu" role="menu">
                  {!collectionMeta && (
                    <button
                      className="collection-overflow-item"
                      onClick={() => { setOverflowOpen(false); onUploadClick(); }}
                    >
                      Upload CSV
                    </button>
                  )}
                  {collectionMeta && (
                    <button
                      className="collection-overflow-item"
                      onClick={() => { setOverflowOpen(false); onUploadClick(); }}
                    >
                      Replace CSV
                    </button>
                  )}
                  <button
                    className="collection-overflow-item"
                    onClick={() => { setOverflowOpen(false); onBulkEditClick(); }}
                  >
                    Bulk edit
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile header (shown at <768px) ────────────────────────── */}
      <div className="collection-mobile-header">
        {/* Row 1: title · count + ⋯ */}
        <div className="collection-mobile-title-row">
          <div className="collection-mobile-title-group">
            <span className="collection-topbar-title">Collection</span>
            {collectionMeta && (
              <span className="collection-mobile-inline-count">
                · {totalCards.toLocaleString()}
              </span>
            )}
          </div>
          <button
            className="collection-overflow-btn collection-mobile-overflow-btn"
            onClick={onOverflowOpen}
            aria-label="More options"
          >
            ⋯
          </button>
        </div>

        {/* Row 2: stats (no provenance) */}
        {collectionMeta && (
          <div className="collection-mobile-stats-row">
            <span className="collection-stats-num">{totalCards.toLocaleString()}</span> cards
            {" · "}
            <span className="collection-stats-num">{uniqueCards.toLocaleString()}</span> unique
            {hasDeckContext && (
              <>
                {" · "}
                <span className="collection-stats-num">{deckCardTotal.toLocaleString()}</span> in decks
              </>
            )}
          </div>
        )}

        {/* Row 3: search + sort (icon-only) */}
        <div className="collection-mobile-search-row">
          <div className="collection-topbar-search collection-mobile-search">
            <span className="collection-topbar-search-icon" aria-hidden>⌕</span>
            <input
              className="collection-topbar-search-input collection-mobile-search-input"
              placeholder={`Search ${uniqueCards.toLocaleString()} cards…`}
              value={collectionSearch}
              onChange={e => onSearchChange(e.target.value)}
            />
          </div>
          <div className="collection-sort-wrap" ref={mobileSortRef}>
            <button
              className={`collection-sort-btn collection-sort-btn--icon${sortOpen ? " active" : ""}`}
              onClick={() => setSortOpen(v => !v)}
              aria-label={`Sort: ${currentSortLabel}`}
            >
              ↕
            </button>
            {sortOpen && (
              <SortPopover
                collectionSort={collectionSort}
                onSortChange={onSortChange}
                onClose={() => setSortOpen(false)}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Desktop filter chips (inline, with counts) ─────────────── */}
      {/* Note: .collection-filter-chips--inline is inside the desktop topbar above.
          The row below is the standalone mobile chips row. */}

      {/* ── Mobile filter chips (no counts) + count label ──────────── */}
      <div className="collection-mobile-filter-area">
        <div className="collection-filter-chips collection-filter-chips--mobile-row">
          {FILTER_KEYS.map(f => (
            <button
              key={f}
              className={`collection-filter-chip${collectionFilter === f ? " active" : ""}`}
              onClick={() => onFilterChange(f)}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
        {collectionMeta && (
          <div className="collection-mobile-count-label">
            SHOWING {filteredCount.toLocaleString()} OF {uniqueCards.toLocaleString()}
          </div>
        )}
      </div>

      {/* ── Stats + provenance line (desktop only) ──────────────────── */}
      {collectionMeta && (
        <div className="collection-stats-line">
          <span className="collection-stats-num">{totalCards.toLocaleString()}</span> cards
          {" · "}
          <span className="collection-stats-num">{uniqueCards.toLocaleString()}</span> unique
          {hasDeckContext && (
            <>
              {" · "}
              <span className="collection-stats-num">{deckCardTotal.toLocaleString()}</span> in decks
            </>
          )}
          {" · from "}
          <code className="collection-filename-chip">{collectionMeta.fileName}</code>
          {" · "}
          {relativeTime(collectionMeta.importedAt)}
        </div>
      )}
    </>
  );
}
