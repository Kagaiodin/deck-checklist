import { useRef, useEffect } from "react";
import type { CollectionSortKey, CollectionFilterKey } from "../../../types/collection";
import { SortPopover, SORT_OPTIONS } from "./SortPopover";

const FILTER_LABELS: Record<CollectionFilterKey, string> = {
  all:       "All",
  "in-deck": "In a deck",
  free:      "Free",
  foils:     "Foils",
};

const FILTER_KEYS: CollectionFilterKey[] = ["all", "in-deck", "free", "foils"];

interface CollectionControlsProps {
  collectionSearch: string;
  onSearchChange: (v: string) => void;
  collectionSort: CollectionSortKey;
  onSortChange: (key: CollectionSortKey) => void;
  sortOpen: boolean;
  onSortOpenChange: (open: boolean) => void;
  collectionFilter: CollectionFilterKey;
  onFilterChange: (key: CollectionFilterKey) => void;
  pillCounts: Record<CollectionFilterKey, number>;
  uniqueCards: number;
}

export function CollectionControls({
  collectionSearch,
  onSearchChange,
  collectionSort,
  onSortChange,
  sortOpen,
  onSortOpenChange,
  collectionFilter,
  onFilterChange,
  pillCounts,
  uniqueCards,
}: CollectionControlsProps) {
  const sortRef = useRef<HTMLDivElement>(null);
  const currentSortLabel = SORT_OPTIONS.find(o => o.value === collectionSort)?.label ?? "Sort";

  useEffect(() => {
    if (!sortOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        onSortOpenChange(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [sortOpen, onSortOpenChange]);

  return (
    <>
      <div className="collection-controls">
        <div className="search-sort-wrap" ref={sortRef}>
          <span className="search-icon" aria-hidden>⌕</span>
          <input
            className="deck-name-input collection-search search-with-sort"
            placeholder={`Search ${uniqueCards.toLocaleString()} cards…`}
            value={collectionSearch}
            onChange={e => onSearchChange(e.target.value)}
          />
          <button
            className={`sort-inline-btn${sortOpen ? " active" : ""}`}
            onClick={() => onSortOpenChange(!sortOpen)}
            title="Sort"
          >
            {currentSortLabel} ▾
          </button>
          {sortOpen && (
            <SortPopover
              collectionSort={collectionSort}
              onSortChange={onSortChange}
              onClose={() => onSortOpenChange(false)}
            />
          )}
        </div>
      </div>

      <div className="filter-pills">
        {FILTER_KEYS.map(f => {
          const count = pillCounts[f];
          return (
            <button
              key={f}
              className={`filter-pill${collectionFilter === f ? " active" : ""}`}
              onClick={() => onFilterChange(f)}
            >
              {FILTER_LABELS[f]}
              {count > 0 && <span className="filter-pill-count">{count.toLocaleString()}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}
